import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { tempDir, join } from '@tauri-apps/api/path';
import { save, open } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { exists, stat } from '@tauri-apps/plugin-fs';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { DownloadItem, TelegramFile, OpeningProgress } from '../types';
import { isMediaFile } from '../utils';
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
    const pendingOpensRef = useRef<Set<number>>(new Set());
    const [openingProgress, setOpeningProgress] = useState<OpeningProgress | null>(null);

    // Listen for progress events from Rust
    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
        listen<ProgressPayload>('download-progress', (event) => {
                console.log('[DOWNLOAD_PROGRESS]', JSON.stringify({ id: event.payload.id, percent: event.payload.percent, downloadedBytes: event.payload.uploaded_bytes, totalBytes: event.payload.total_bytes, speedBps: event.payload.speed_bytes_per_sec }));
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
            console.log('[QUEUE_PROCESSOR]', JSON.stringify({ processing, pendingCount: downloadQueue.filter(i => i.status === 'pending').length, nextItemId: nextItem.id, nextItemMsgId: nextItem.messageId, nextItemFilename: nextItem.filename, queueSnapshot: downloadQueue.map(i => ({ id: i.id, msgId: i.messageId, status: i.status })) }));
            processItem(nextItem);
        }
    }, [downloadQueue, processing]);

    const processItem = async (item: DownloadItem) => {
        console.log(`[useFileDownload] Processing item:`, item);
        setProcessing(true);
        setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'downloading', progress: 0 } : i));
        console.log('[DOWNLOAD_STARTED]', JSON.stringify({ messageId: item.messageId, filename: item.filename, id: item.id, folderId: item.folderId }));

        try {
            console.log(`[useFileDownload] Opening save dialog for: ${item.filename}`);
            const savePath = await save({ defaultPath: item.filename });
            if (!savePath) {
                console.log('[SAVE_DIALOG]', JSON.stringify({ messageId: item.messageId, path: null, cancelled: true }));
                setDownloadQueue(q => q.filter(i => i.id !== item.id));
                setProcessing(false);
                return;
            }
            console.log('[SAVE_DIALOG]', JSON.stringify({ messageId: item.messageId, path: savePath, cancelled: false }));

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
                console.log('[DOWNLOAD_COMPLETED]', JSON.stringify({ messageId: item.messageId, filename: item.filename, id: item.id, newStatus: 'success' }));
                setDownloadQueue(q => q.map(i => i.id === item.id ? { ...i, status: 'success', progress: 100 } : i));
                toast.success(`Downloaded: ${item.filename}`);
            }
        } catch (e) {
            console.log('[DOWNLOAD_FAILED]', JSON.stringify({ messageId: item.messageId, filename: item.filename, id: item.id, error: String(e), isCancelled: cancelledRef.current.has(item.id) }));
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
        console.log('[DOWNLOAD_REQUESTED]', JSON.stringify({ messageId, filename, folderId, timestamp: Date.now() }));
        const newItem: DownloadItem = {
            id: Math.random().toString(36).substr(2, 9),
            messageId,
            filename,
            folderId,
            status: 'pending'
        };
        setDownloadQueue(prev => [...prev, newItem]);
        console.log('[DOWNLOAD_QUEUED]', JSON.stringify({ messageId, filename, id: newItem.id, status: 'pending' }));
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
        console.log('[CLEAR_FINISHED]', JSON.stringify({ before: downloadQueue.length, removedSuccessItems: downloadQueue.filter(i => i.status === 'success').length, remainingItems: downloadQueue.filter(i => i.status !== 'success').map(i => ({ id: i.id, status: i.status })) }));
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
        if (pendingOpensRef.current.has(messageId)) {
            console.log(`[useFileDownload] Ignoring duplicate open for messageId=${messageId}`);
            return;
        }
        pendingOpensRef.current.add(messageId);

        const isMedia = isMediaFile(filename);
        const t0 = performance.now();
        console.log(`[Timing] User clicked Open: messageId=${messageId}, filename="${filename}", folderId=${folderId}, isMedia=${isMedia}`);
        let downloadMs = 0;
        let progressUnlisten: UnlistenFn | undefined;
        let toastId: string | number | undefined;
        try {
            const tempDirPath = await tempDir();
            const tempPath = await join(tempDirPath, `${messageId}_${filename}`);

            let fileReady = false;
            try {
                fileReady = await exists(tempPath);
                if (fileReady) {
                    const meta = await stat(tempPath);
                    if (meta.size === 0) fileReady = false;
                }
            } catch {
                fileReady = false;
            }

            if (fileReady) {
                console.log(`[Timing] File already cached, skipping download: ${tempPath}`);
            } else {
                const t1 = performance.now();
                console.log(`[Timing] Download started: elapsed=${(t1 - t0).toFixed(1)}ms`);

                const transferId = `open_${messageId}_${Date.now()}`;

                // Show UI based on file type
                if (isMedia) {
                    setOpeningProgress({
                        filename,
                        messageId,
                        folderId,
                        transferId,
                        phase: 'downloading',
                        percent: 0,
                        speedBytesPerSec: 0,
                    });
                    progressUnlisten = await listen<ProgressPayload>('download-progress', (event) => {
                        if (event.payload.id === transferId) {
                            setOpeningProgress(prev => prev ? {
                                ...prev,
                                percent: event.payload.percent,
                                speedBytesPerSec: event.payload.speed_bytes_per_sec,
                            } : null);
                        }
                    });
                } else {
                    toastId = toast.loading(`Opening ${filename}...`, { duration: Infinity });
                }

                await invoke('cmd_download_file', {
                    messageId,
                    savePath: tempPath,
                    folderId,
                    transferId,
                });

                // Cleanup progress listener after download completes
                if (progressUnlisten) {
                    progressUnlisten();
                    progressUnlisten = undefined;
                }

                const t2 = performance.now();
                downloadMs = t2 - t1;
                console.log(`[Timing] Download completed: elapsed=${(t2 - t0).toFixed(1)}ms, duration=${downloadMs.toFixed(1)}ms`);
            }

            // Transition to "opening" phase
            if (isMedia) {
                setOpeningProgress(prev => prev ? { ...prev, phase: 'launching', percent: 100 } : null);
            } else {
                toast.loading(`Opening ${filename} with system app...`, { id: toastId });
            }

            const t3 = performance.now();
            console.log(`[Timing] openPath invoked: elapsed=${(t3 - t0).toFixed(1)}ms`);

            await openPath(tempPath);

            const t4 = performance.now();
            console.log(`[Timing] openPath returned: elapsed=${(t4 - t0).toFixed(1)}ms, duration=${(t4 - t3).toFixed(1)}ms`);
            console.log(`[Timing] === Summary for "${filename}" ===`);
            console.log(`[Timing]   Download: ${fileReady ? 'cached (0ms)' : `${downloadMs.toFixed(1)}ms`}`);
            console.log(`[Timing]   openPath: ${(t4 - t3).toFixed(1)}ms`);
            console.log(`[Timing]   Total: ${(t4 - t0).toFixed(1)}ms`);

            if (isMedia) {
                setOpeningProgress(null);
            } else {
                toast.success(`Opened ${filename}`, { id: toastId });
            }
        } catch (e) {
            console.error(`[useFileDownload] Open failed for ${filename}:`, e);
            if (isMedia) {
                setOpeningProgress(prev => prev ? {
                    ...prev,
                    phase: 'error',
                    error: String(e),
                } : null);
            } else {
                toast.error(`Failed to open ${filename}: ${e}`, { id: toastId });
            }
        } finally {
            if (progressUnlisten) {
                progressUnlisten();
            }
            pendingOpensRef.current.delete(messageId);
        }
    };

    const cancelOpening = () => {
        if (openingProgress && openingProgress.phase === 'downloading') {
            cancelledRef.current.add(openingProgress.transferId);
            invoke('cmd_cancel_transfer', { transferId: openingProgress.transferId }).catch(() => {});
        }
        setOpeningProgress(null);
    };

    const retryOpening = (messageId: number, filename: string, folderId: number | null) => {
        setOpeningProgress(null);
        setTimeout(() => openWithSystemApp(messageId, filename, folderId), 100);
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
        openingProgress,
        cancelOpening,
        retryOpening,
    };
}
