import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { tempDir, join } from '@tauri-apps/api/path';
import { save, open } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { DownloadItem, TelegramFile } from '../types';
import type { Store } from '@tauri-apps/plugin-store';

interface ProgressPayload {
    id: string;
    percent: number;
    uploaded_bytes: number;
    total_bytes: number;
    speed_bytes_per_sec: number;
}

export function useFileDownload(store: Store | null) {
    const [downloadQueue, setDownloadQueue] = useState<DownloadItem[]>([]);
    const [processing, setProcessing] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const cancelledRef = useRef<Set<string>>(new Set());

    // Listen for progress events from Rust
    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
        listen<ProgressPayload>('download-progress', (event) => {
            setDownloadQueue(q => q.map(i =>
                i.id === event.payload.id ? {
                    ...i,
                    progress: event.payload.percent,
                    uploadedBytes: event.payload.uploaded_bytes,
                    totalBytes: event.payload.total_bytes,
                    speedBytesPerSec: event.payload.speed_bytes_per_sec,
                } : i
            ));
        }).then(fn => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, []);

    // Load saved queue on mount
    useEffect(() => {
        if (!store || initialized) return;
        store.get<DownloadItem[]>('downloadQueue').then((saved) => {
            if (saved && saved.length > 0) {
                const pending = saved.filter(i => i.status === 'pending');
                if (pending.length > 0) {
                    setDownloadQueue(pending);
                    toast.info(`Restored ${pending.length} pending downloads`);
                }
            }
            setInitialized(true);
        });
    }, [store, initialized]);

    // Save queue when it changes (only pending items)
    useEffect(() => {
        if (!store || !initialized) return;
        const pending = downloadQueue.filter(i => i.status === 'pending');
        store.set('downloadQueue', pending).then(() => store.save());
    }, [store, downloadQueue, initialized]);

    // Queue Processor
    useEffect(() => {
        if (processing) return;
        const nextItem = downloadQueue.find(i => i.status === 'pending');
        if (nextItem) {
            processItem(nextItem);
        }
    }, [downloadQueue, processing]);

    const processItem = async (item: DownloadItem) => {
        console.log(`[useFileDownload] Processing item:`, item);
        setProcessing(true);
        setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'downloading', progress: 0 } : i));

        try {
            console.log(`[useFileDownload] Opening save dialog for: ${item.filename}`);
            const savePath = await save({ defaultPath: item.filename });
            if (!savePath) {
                console.log(`[useFileDownload] Download cancelled by user (no save path)`);
                setDownloadQueue(q => q.filter(i => i.id !== item.id));
                setProcessing(false);
                return;
            }
            console.log(`[useFileDownload] Save path selected: ${savePath}`);

            console.log(`[useFileDownload] Invoking cmd_download_file for messageId: ${item.messageId}`);
            await invoke('cmd_download_file', {
                messageId: item.messageId,
                savePath,
                folderId: item.folderId,
                transferId: item.id
            });

            if (cancelledRef.current.has(item.id)) {
                console.log(`[useFileDownload] Transfer for ${item.id} was cancelled during invoke`);
                cancelledRef.current.delete(item.id);
            } else {
                console.log(`[useFileDownload] Download successful for: ${item.filename}`);
                setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'success', progress: 100 } : i));
                toast.success(`Downloaded: ${item.filename}`);
            }
        } catch (e) {
            console.error(`[useFileDownload] Download error for ${item.filename}:`, e);
            if (!cancelledRef.current.has(item.id)) {
                const errMsg = String(e);
                if (errMsg.includes('Transfer cancelled')) {
                    setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'cancelled' } : i));
                } else {
                    setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'error', error: errMsg } : i));
                    toast.error(`Download failed: ${item.filename}`);
                }
            } else {
                console.log(`[useFileDownload] Caught error for cancelled transfer: ${item.id}`);
                cancelledRef.current.delete(item.id);
            }
        } finally {
            setProcessing(false);
        }
    };

    const queueDownload = (messageId: number, filename: string, folderId: number | null) => {
        console.log(`[useFileDownload] Queuing download: messageId=${messageId}, filename=${filename}, folderId=${folderId}`);
        const newItem: DownloadItem = {
            id: Math.random().toString(36).substr(2, 9),
            messageId,
            filename,
            folderId,
            status: 'pending'
        };
        setDownloadQueue(prev => [...prev, newItem]);
    };

    const queueBulkDownload = async (files: TelegramFile[], folderId: number | null) => {
        console.log(`[useFileDownload] Queuing bulk download for ${files.length} files`);
        const dirPath = await open({
            directory: true,
            multiple: false,
            title: "Select Download Destination"
        });
        if (!dirPath) {
            console.log(`[useFileDownload] Bulk download cancelled: no directory selected`);
            return;
        }
        console.log(`[useFileDownload] Bulk download destination: ${dirPath}`);

        for (const file of files) {
            const newItem: DownloadItem = {
                id: Math.random().toString(36).substr(2, 9),
                messageId: file.id,
                filename: file.name,
                folderId,
                status: 'pending'
            };
            setDownloadQueue(prev => [...prev, newItem]);
        }

        toast.info(`Queued ${files.length} files for download`);
    };

    const clearFinished = () => {
        setDownloadQueue(q => q.filter(i => i.status !== 'success'));
    };

    const cancelAll = () => {
        setDownloadQueue(q => {
            const downloading = q.find(i => i.status === 'downloading');
            if (downloading) {
                cancelledRef.current.add(downloading.id);
                invoke('cmd_cancel_transfer', { transferId: downloading.id }).catch(() => {});
            }
            return q
                .filter(i => i.status !== 'pending')
                .map(i => i.status === 'downloading' ? { ...i, status: 'cancelled' as const } : i);
        });
        toast.info('All downloads cancelled');
    };

    const cancelItem = (id: string) => {
        setDownloadQueue(q => {
            const item = q.find(i => i.id === id);
            if (item?.status === 'downloading') {
                cancelledRef.current.add(id);
                invoke('cmd_cancel_transfer', { transferId: id }).catch(() => {});
                return q.map(i => i.id === id ? { ...i, status: 'cancelled' as const } : i);
            }
            if (item?.status === 'pending') {
                return q.filter(i => i.id !== id);
            }
            return q;
        });
    };

    const retryItem = (id: string) => {
        setDownloadQueue(q => q.map(i =>
            i.id === id && (i.status === 'error' || i.status === 'cancelled')
                ? { ...i, status: 'pending' as const, error: undefined, progress: undefined, uploadedBytes: undefined, totalBytes: undefined, speedBytesPerSec: undefined }
                : i
        ));
    };

    const openWithSystemApp = async (messageId: number, filename: string, folderId: number | null) => {
        toast.info(`Opening ${filename}...`);
        try {
            const tempDirPath = await tempDir();
            const tempPath = await join(tempDirPath, filename);

            await invoke('cmd_download_file', {
                messageId,
                savePath: tempPath,
                folderId,
            });

            await openPath(tempPath);
            toast.success(`Opened ${filename}`);
        } catch (e) {
            toast.error(`Failed to open ${filename}: ${e}`);
        }
    };

    return {
        downloadQueue,
        queueDownload,
        queueBulkDownload,
        clearFinished,
        cancelAll,
        cancelItem,
        retryItem,
        openWithSystemApp,
    };
}
