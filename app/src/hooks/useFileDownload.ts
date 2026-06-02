import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { tempDir, join } from '@tauri-apps/api/path';
import { save, open } from '@tauri-apps/plugin-dialog';
import { openPath } from '@tauri-apps/plugin-opener';
import { exists, stat } from '@tauri-apps/plugin-fs';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { DownloadItem, TelegramFile, OpeningProgress, BatchDownload } from '../types';
import { isMediaFile } from '../utils';
import type { Store } from '@tauri-apps/plugin-store';

interface ProgressPayload {
    id: string;
    percent: number;
    uploaded_bytes: number;
    total_bytes: number;
    speed_bytes_per_sec: number;
}

function calcBatchAggregate(items: DownloadItem[]) {
    let totalBytes = 0;
    let uploadedBytes = 0;
    let speedBytesPerSec = 0;
    let completed = 0;
    let failed = 0;
    let active = 0;

    for (const item of items) {
        if (item.status === 'success') {
            completed++;
            if (item.totalBytes) totalBytes += item.totalBytes;
            if (item.uploadedBytes) uploadedBytes += item.uploadedBytes;
        } else if (item.status === 'error' || item.status === 'cancelled') {
            failed++;
            if (item.totalBytes) totalBytes += item.totalBytes;
            if (item.uploadedBytes) uploadedBytes += item.uploadedBytes;
        } else {
            active++;
            if (item.totalBytes) totalBytes += item.totalBytes;
            if (item.uploadedBytes) uploadedBytes += item.uploadedBytes;
            if (item.speedBytesPerSec) speedBytesPerSec += item.speedBytesPerSec;
        }
    }

    const percent = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;
    return { percent, completed, failed, active, totalBytes, uploadedBytes, speedBytesPerSec, total: items.length };
}

function updateItemInBatch(batches: BatchDownload[], itemId: string, updater: (item: DownloadItem) => DownloadItem): BatchDownload[] {
    return batches.map(batch => {
        const idx = batch.items.findIndex(i => i.id === itemId);
        if (idx === -1) return batch;
        const updatedItems = [...batch.items];
        updatedItems[idx] = updater(updatedItems[idx]);
        const allDone = updatedItems.every(i => i.status === 'success' || i.status === 'error' || i.status === 'cancelled');
        return { ...batch, items: updatedItems, status: allDone ? 'completed' : batch.status };
    });
}

export function useFileDownload(store: Store | null) {
    const [downloadQueue, setDownloadQueue] = useState<DownloadItem[]>([]);
    const [batchDownloads, setBatchDownloads] = useState<BatchDownload[]>([]);
    const [processing, setProcessing] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const cancelledRef = useRef<Set<string>>(new Set());
    const pendingOpensRef = useRef<Set<number>>(new Set());
    const [openingProgress, setOpeningProgress] = useState<OpeningProgress | null>(null);

    // Listen for progress events from Rust
    useEffect(() => {
        let unlisten: UnlistenFn | undefined;
        listen<ProgressPayload>('download-progress', (event) => {
            const payload = event.payload;

            setDownloadQueue(prev => {
                const found = prev.some(i => i.id === payload.id);
                if (!found) return prev;
                return prev.map(i =>
                    i.id === payload.id ? {
                        ...i,
                        progress: payload.percent,
                        uploadedBytes: payload.uploaded_bytes,
                        totalBytes: payload.total_bytes,
                        speedBytesPerSec: payload.speed_bytes_per_sec,
                    } : i
                );
            });
            setBatchDownloads(prev => {
                const found = prev.some(b => b.items.some(i => i.id === payload.id));
                if (!found) return prev;
                return updateItemInBatch(prev, payload.id, item => ({
                    ...item,
                    progress: payload.percent,
                    uploadedBytes: payload.uploaded_bytes,
                    totalBytes: payload.total_bytes,
                    speedBytesPerSec: payload.speed_bytes_per_sec,
                }));
            });
        }).then(fn => { unlisten = fn; });
        return () => { unlisten?.(); };
    }, []);

    // Load saved queue on mount
    useEffect(() => {
        if (!store || initialized) return;
        Promise.all([
            store.get<DownloadItem[]>('downloadQueue'),
            store.get<BatchDownload[]>('batchDownloads'),
        ]).then(([savedQueue, savedBatches]) => {
            if (savedQueue && savedQueue.length > 0) {
                const pending = savedQueue.filter(i => i.status === 'pending');
                if (pending.length > 0) {
                    setDownloadQueue(pending);
                    toast.info(`Restored ${pending.length} pending downloads`);
                }
            }
            if (savedBatches && savedBatches.length > 0) {
                const activeBatches = savedBatches.filter(b => b.status === 'downloading');
                if (activeBatches.length > 0) {
                    setBatchDownloads(activeBatches);
                    const totalPending = activeBatches.reduce((s, b) => s + b.items.filter(i => i.status === 'pending').length, 0);
                    if (totalPending > 0) {
                        toast.info(`Restored ${totalPending} pending batch downloads`);
                    }
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

    // Save batch downloads when they change
    useEffect(() => {
        if (!store || !initialized) return;
        const activeBatches = batchDownloads.filter(b => b.status === 'downloading');
        store.set('batchDownloads', activeBatches).then(() => store.save());
    }, [store, batchDownloads, initialized]);

    // Queue Processor
    useEffect(() => {
        if (processing) return;

        const nextSingle = downloadQueue.find(i => i.status === 'pending');
        if (nextSingle) {
            processItem(nextSingle);
            return;
        }

        for (const batch of batchDownloads) {
            if (batch.status !== 'downloading') continue;
            const nextBatchItem = batch.items.find(i => i.status === 'pending');
            if (nextBatchItem) {
                processItem(nextBatchItem);
                return;
            }
        }
    }, [downloadQueue, batchDownloads, processing]);

    const processItem = async (item: DownloadItem) => {
        setProcessing(true);

        const markDownloading = (id: string) => {
            setDownloadQueue(q => q.map(i => i.id === id ? { ...i, status: 'downloading', progress: 0 } : i));
            setBatchDownloads(prev => updateItemInBatch(prev, id, i => ({ ...i, status: 'downloading', progress: 0 })));
        };
        markDownloading(item.id);

        try {
            let savePath: string | undefined = item.targetPath;
            if (!savePath) {
                const dialogPath = await save({ defaultPath: item.filename });
                if (!dialogPath) {
                    if (item.batchId) {
                        setBatchDownloads(prev => updateItemInBatch(prev, item.id, i => ({ ...i, status: 'cancelled' })));
                    } else {
                        setDownloadQueue(q => q.filter(i => i.id !== item.id));
                    }
                    setProcessing(false);
                    return;
                }
                savePath = dialogPath;
            }

            await invoke('cmd_download_file', {
                messageId: item.messageId,
                savePath,
                folderId: item.folderId,
                transferId: item.id,
            });

            if (cancelledRef.current.has(item.id)) {
                cancelledRef.current.delete(item.id);
            } else {
                const markSuccess = (id: string) => {
                    setDownloadQueue(q => q.map(i => i.id === id ? { ...i, status: 'success', progress: 100 } : i));
                    setBatchDownloads(prev => updateItemInBatch(prev, id, i => ({ ...i, status: 'success', progress: 100 })));
                };
                markSuccess(item.id);
                if (!item.batchId) {
                    toast.success(`Downloaded: ${item.filename}`);
                }
            }
        } catch (e) {
            const errMsg = String(e);
            if (!cancelledRef.current.has(item.id)) {
                const isCancelled = errMsg.includes('Transfer cancelled');
                if (isCancelled) {
                    const markCancelled = (id: string) => {
                        setDownloadQueue(q => q.map(i => i.id === id ? { ...i, status: 'cancelled' } : i));
                        setBatchDownloads(prev => updateItemInBatch(prev, id, i => ({ ...i, status: 'cancelled' })));
                    };
                    markCancelled(item.id);
                } else {
                    const markError = (id: string) => {
                        setDownloadQueue(q => q.map(i => i.id === id ? { ...i, status: 'error', error: errMsg } : i));
                        setBatchDownloads(prev => updateItemInBatch(prev, id, i => ({ ...i, status: 'error', error: errMsg })));
                    };
                    markError(item.id);
                    if (!item.batchId) {
                        toast.error(`Download failed: ${item.filename}`);
                    }
                }
            } else {
                cancelledRef.current.delete(item.id);
            }
        } finally {
            setProcessing(false);
        }
    };

    const queueDownload = (messageId: number, filename: string, folderId: number | null) => {
        const newItem: DownloadItem = {
            id: Math.random().toString(36).substr(2, 9),
            messageId,
            filename,
            folderId,
            status: 'pending',
        };
        setDownloadQueue(prev => [...prev, newItem]);
    };

    const makePathUnique = async (path: string, reservedPaths?: Set<string>): Promise<string> => {
        try {
            const isTaken = async (p: string) => {
                if (reservedPaths?.has(p)) return true;
                return await invoke<boolean>('cmd_file_exists', { path: p });
            };

            if (!(await isTaken(path))) return path;

            const extIndex = path.lastIndexOf('.');
            const base = extIndex !== -1 ? path.substring(0, extIndex) : path;
            const ext = extIndex !== -1 ? path.substring(extIndex) : '';
            let counter = 1;
            while (true) {
                const newPath = `${base} (${counter})${ext}`;
                if (!(await isTaken(newPath))) return newPath;
                counter++;
                if (counter > 100) return newPath;
            }
        } catch {
            return path;
        }
    };

    const queueBulkDownload = async (
        entries: Array<{ file: TelegramFile; relativePath: string; isDirectory?: boolean }>,
        folderId: number | null,
        currentFolderName: string,
    ) => {
        const dirPath = await open({
            directory: true,
            multiple: false,
            title: "Select Download Destination",
        });
        if (!dirPath) return;

        const batchId = Math.random().toString(36).substr(2, 9);
        const sanitizedRootName = currentFolderName.replace(/[<>:"/\\|?*]/g, '_');

        // Issue 2: Make the container directory name unique
        let rootDirPath = `${dirPath}/${sanitizedRootName}`;
        let dirCounter = 1;
        while (await invoke<boolean>('cmd_file_exists', { path: rootDirPath })) {
            rootDirPath = `${dirPath}/${sanitizedRootName} (${dirCounter})`;
            dirCounter++;
            if (dirCounter > 100) break;
        }

        // Ensure the root container directory exists
        await invoke('cmd_create_dir', { path: rootDirPath });

        // Collect unique sub-directories that need to be created
        const subDirs = new Set<string>();
        for (const { relativePath, isDirectory } of entries) {
            if (isDirectory) {
                subDirs.add(`${rootDirPath}/${relativePath}`);
            } else {
                const parentDir = relativePath.substring(0, relativePath.lastIndexOf('/'));
                if (parentDir) {
                    subDirs.add(`${rootDirPath}/${parentDir}`);
                }
            }
        }
        for (const subDir of subDirs) {
            await invoke('cmd_create_dir', { path: subDir });
        }

        // Issue 1: Track paths already assigned within this batch
        const reservedPaths = new Set<string>();
        const items: DownloadItem[] = [];
        for (const { file, relativePath, isDirectory } of entries) {
            if (isDirectory) continue;
            let filePath = `${rootDirPath}/${relativePath}`;
            filePath = await makePathUnique(filePath, reservedPaths);
            reservedPaths.add(filePath);
            items.push({
                id: Math.random().toString(36).substr(2, 9),
                batchId,
                messageId: file.current_id ?? file.id,
                filename: file.name,
                folderId,
                status: 'pending',
                targetPath: filePath,
                totalBytes: file.size,
            });
        }

        // If only directories were created (no files to download), skip batch UI
        if (items.length === 0) {
            toast.success(`Created folder structure at ${rootDirPath}`);
            return;
        }

        const batch: BatchDownload = {
            batchId,
            dirPath: rootDirPath,
            folderName: currentFolderName,
            items,
            status: 'downloading',
            expanded: false,
            errorCount: 0,
            startedAt: Date.now(),
        };

        setBatchDownloads(prev => [...prev, batch]);
        toast.info(`Queued ${items.length} files for download`);
    };

    const clearFinished = () => {
        setDownloadQueue(q => q.filter(i => i.status !== 'success'));
        setBatchDownloads(prev => prev.filter(b => b.status === 'downloading'));
    };

    const cancelAll = () => {
        const allItems = [
            ...downloadQueue.filter(i => i.status === 'downloading' || i.status === 'pending'),
            ...batchDownloads.flatMap(b => b.items.filter(i => i.status === 'downloading' || i.status === 'pending')),
        ];

        for (const item of allItems) {
            if (item.status === 'downloading') {
                cancelledRef.current.add(item.id);
                invoke('cmd_cancel_transfer', { transferId: item.id }).catch(() => {});
            }
        }

        setDownloadQueue(q => q
            .filter(i => i.status !== 'pending')
            .map(i => i.status === 'downloading' ? { ...i, status: 'cancelled' as const } : i)
        );

        setBatchDownloads(prev => prev.map(batch => ({
            ...batch,
            status: 'cancelled',
            items: batch.items.map(i => {
                if (i.status === 'downloading') return { ...i, status: 'cancelled' as const };
                if (i.status === 'pending') return { ...i, status: 'cancelled' as const };
                return i;
            }),
        })));

        toast.info('All downloads cancelled');
    };

    const cancelItem = (id: string) => {
        const isInBatch = batchDownloads.some(b => b.items.some(i => i.id === id));

        if (isInBatch) {
            setBatchDownloads(prev => updateItemInBatch(prev, id, item => {
                if (item.status === 'downloading') {
                    cancelledRef.current.add(id);
                    invoke('cmd_cancel_transfer', { transferId: id }).catch(() => {});
                    return { ...item, status: 'cancelled' as const };
                }
                if (item.status === 'pending') {
                    return { ...item, status: 'cancelled' as const };
                }
                return item;
            }));
        } else {
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
        }
    };

    const retryItem = (id: string) => {
        const isInBatch = batchDownloads.some(b => b.items.some(i => i.id === id));

        if (isInBatch) {
            setBatchDownloads(prev => prev.map(batch => {
                if (!batch.items.some(i => i.id === id)) return batch;
                return {
                    ...batch,
                    status: 'downloading',
                    items: batch.items.map(i =>
                        i.id === id && (i.status === 'error' || i.status === 'cancelled')
                            ? { ...i, status: 'pending' as const, error: undefined, progress: undefined, uploadedBytes: undefined, totalBytes: undefined, speedBytesPerSec: undefined }
                            : i
                    ),
                };
            }));
        } else {
            setDownloadQueue(q => q.map(i =>
                i.id === id && (i.status === 'error' || i.status === 'cancelled')
                    ? { ...i, status: 'pending' as const, error: undefined, progress: undefined, uploadedBytes: undefined, totalBytes: undefined, speedBytesPerSec: undefined }
                    : i
            ));
        }
    };

    const cancelBatch = (batchId: string) => {
        setBatchDownloads(prev => prev.map(batch => {
            if (batch.batchId !== batchId) return batch;
            for (const item of batch.items) {
                if (item.status === 'downloading') {
                    cancelledRef.current.add(item.id);
                    invoke('cmd_cancel_transfer', { transferId: item.id }).catch(() => {});
                }
            }
            return {
                ...batch,
                status: 'cancelled',
                items: batch.items.map(i =>
                    i.status === 'downloading' || i.status === 'pending'
                        ? { ...i, status: 'cancelled' as const }
                        : i
                ),
            };
        }));
        toast.info('Batch download cancelled');
    };

    const toggleBatchExpand = (batchId: string) => {
        setBatchDownloads(prev => prev.map(batch =>
            batch.batchId === batchId ? { ...batch, expanded: !batch.expanded } : batch
        ));
    };

    const openWithSystemApp = async (messageId: number, filename: string, folderId: number | null) => {
        if (pendingOpensRef.current.has(messageId)) {
            return;
        }
        pendingOpensRef.current.add(messageId);

        const isMedia = isMediaFile(filename);
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
            } else {
                const transferId = `open_${messageId}_${Date.now()}`;

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

                if (progressUnlisten) {
                    progressUnlisten();
                    progressUnlisten = undefined;
                }
            }

            if (isMedia) {
                setOpeningProgress(prev => prev ? { ...prev, phase: 'launching', percent: 100 } : null);
            } else {
                toast.loading(`Opening ${filename} with system app...`, { id: toastId });
            }

            await openPath(tempPath);

            if (isMedia) {
                setOpeningProgress(null);
            } else {
                toast.success(`Opened ${filename}`, { id: toastId });
            }
        } catch (e) {
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
        batchDownloads,
        calcBatchAggregate,
        queueDownload,
        queueBulkDownload,
        clearFinished,
        cancelAll,
        cancelItem,
        retryItem,
        cancelBatch,
        toggleBatchExpand,
        openWithSystemApp,
        openingProgress,
        cancelOpening,
        retryOpening,
    };
}
