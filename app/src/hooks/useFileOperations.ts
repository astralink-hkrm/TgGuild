import { invoke } from '@tauri-apps/api/core';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { TelegramFile, FolderTreeNode } from '../types';

function findFolderInTree(nodes: FolderTreeNode[], id: number): FolderTreeNode | null {
    for (const node of nodes) {
        if (node.id === id) return node;
        const found = findFolderInTree(node.children, id);
        if (found) return found;
    }
    return null;
}

export function useFileOperations(
    activeFolderId: number | null,
    activeVirtualFolderId: number | null,
    selectedIds: number[],
    setSelectedIds: (ids: number[]) => void,
    displayedFiles: TelegramFile[]
) {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();

    const invalidateCurrent = () => {
        queryClient.invalidateQueries({ queryKey: ['files', activeFolderId, activeVirtualFolderId] });
        if (activeFolderId !== null) {
            queryClient.invalidateQueries({ queryKey: ['folderTree', activeFolderId] });
        }
    };

    const handleDelete = async (id: number) => {
        if (!await confirm({ title: "Delete File", message: "Are you sure you want to delete this file?", confirmText: "Delete", variant: 'danger' })) return;
        try {
            await invoke('cmd_delete_file', { messageId: id, folderId: activeFolderId });
            invalidateCurrent();
            toast.success("File deleted");
        } catch (e) {
            toast.error(`Delete failed: ${e}`);
        }
    }

    const handleRename = async (id: number, newName: string) => {
        try {
            await invoke('cmd_rename_file', { messageId: id, folderId: activeFolderId, newName });
            invalidateCurrent();
            toast.success("File renamed");
        } catch (e) {
            toast.error(`Rename failed: ${e}`);
        }
    };

    const getSubfolderIds = async (virtualFolderId: number): Promise<number[]> => {
        if (activeFolderId !== null) {
            const tree = await invoke<FolderTreeNode[]>('cmd_get_folder_tree', { folderId: activeFolderId });
            const node = findFolderInTree(tree, virtualFolderId);
            return node ? node.children.map(c => c.id) : [];
        }
        const contents = await invoke<any[]>('cmd_get_files', { folderId: activeFolderId, virtualFolderId });
        return contents.filter((f: any) => f.icon_type === 'folder' || f.name.endsWith('/')).map((f: any) => f.id);
    };

    const getSubfolderNodes = async (virtualFolderId: number): Promise<FolderTreeNode[]> => {
        if (activeFolderId !== null) {
            const tree = await invoke<FolderTreeNode[]>('cmd_get_folder_tree', { folderId: activeFolderId });
            const node = findFolderInTree(tree, virtualFolderId);
            return node ? node.children : [];
        }
        const contents = await invoke<any[]>('cmd_get_files', { folderId: activeFolderId, virtualFolderId });
        return contents.filter((f: any) => f.icon_type === 'folder' || f.name.endsWith('/')).map((f: any) => ({
            id: f.id,
            name: f.name.replace('/', ''),
            children: [],
        }));
    };

    const handleBulkDelete = async () => {
        if (selectedIds.length === 0) return;
        if (!await confirm({ title: "Delete Files", message: `Are you sure you want to delete ${selectedIds.length} files?`, confirmText: "Delete All", variant: 'danger' })) return;

        let success = 0;
        let fail = 0;
        for (const id of selectedIds) {
            try {
                await invoke('cmd_delete_file', { messageId: id, folderId: activeFolderId });
                success++;
            } catch {
                fail++;
            }
        }
        setSelectedIds([]);
        invalidateCurrent();
        if (success > 0) toast.success(`Deleted ${success} files.`);
        if (fail > 0) toast.error(`Failed to delete ${fail} files.`);
    }

    const handleDownload = async (id: number, name: string) => {
        try {
            const savePath = await import('@tauri-apps/plugin-dialog').then(d => d.save({ defaultPath: name }));
            if (!savePath) return;
            toast.info(`Download started: ${name}`);
            await invoke('cmd_download_file', { messageId: id, savePath, folderId: activeFolderId });
            toast.success(`Download complete: ${name}`);
        } catch (e) {
            toast.error(`Download failed: ${e}`);
        }
    }

    const handleBulkDownload = async () => {
        if (selectedIds.length === 0) return;

        try {
            const dirPath = await import('@tauri-apps/plugin-dialog').then(d => d.open({
                directory: true, multiple: false, title: "Select Download Destination"
            }));
            if (!dirPath) return;

            const itemsToDownload = displayedFiles.filter((f) => selectedIds.includes(f.current_id ?? f.id));
            const files = itemsToDownload.filter(f => f.type !== 'folder');
            const folders = itemsToDownload.filter(f => f.type === 'folder');

            let totalFiles = files.length;
            let downloadedCount = 0;

            for (const folder of folders) {
                const count = await countFilesInFolder(folder.id);
                totalFiles += count;
            }

            toast.info(`Starting download of ${totalFiles} file(s)...`);

            for (const file of files) {
                const filePath = `${dirPath}/${file.name}`;
                const messageId = file.current_id ?? file.id;
                try {
                    toast.info(`Downloading: ${file.name}`, { duration: 1000 });
                    await invoke('cmd_download_file', { messageId, savePath: filePath, folderId: activeFolderId });
                    downloadedCount++;
                } catch (e) {
                    const errorStr = String(e);
                    if (!errorStr.includes('No media in message')) {
                        console.error(`Failed to download ${file.name}:`, e);
                    }
                }
            }

            for (const folder of folders) {
                const folderPath = `${dirPath}/${folder.name.replace('/', '')}`;
                const count = await downloadFolderRecursively(folder, folderPath, activeFolderId);
                downloadedCount += count;
            }

            toast.success(`Downloaded ${downloadedCount} of ${totalFiles} file(s).`);
            setSelectedIds([]);
        } catch (e) {
            toast.error(`Bulk download failed: ${e}`);
        }
    };

    const countFilesInFolder = async (virtualFolderId: number): Promise<number> => {
        try {
            const contents = await invoke<any[]>('cmd_get_files', {
                folderId: activeFolderId,
                virtualFolderId
            });
            const files = contents.filter((f: any) => f.icon_type !== 'folder' && !f.name.endsWith('/'));
            let count = files.length;

            const subIds = await getSubfolderIds(virtualFolderId);
            for (const subId of subIds) {
                count += await countFilesInFolder(subId);
            }

            return count;
        } catch (e) {
            console.error('Failed to count files:', e);
            return 0;
        }
    };

    const downloadFolderRecursively = async (
        folder: TelegramFile,
        folderPath: string,
        folderId: number | null
    ): Promise<number> => {
        let downloadedCount = 0;

        try {
            const contents = await invoke<any[]>('cmd_get_files', {
                folderId,
                virtualFolderId: folder.id
            });

            const files = contents.filter((f: any) => f.icon_type !== 'folder' && !f.name.endsWith('/'));

            for (const file of files) {
                const filePath = `${folderPath}/${file.name}`;
                try {
                    const displayPath = folderPath.split('/').slice(-2).join('/') + '/' + file.name;
                    toast.info(`Downloading: ${displayPath}`, { duration: 1000 });
                    await invoke('cmd_download_file', {
                        messageId: file.current_id ?? file.id,
                        savePath: filePath,
                        folderId
                    });
                    downloadedCount++;
                } catch (e) {
                    const errorStr = String(e);
                    if (!errorStr.includes('No media in message')) {
                        console.error(`Failed to download ${file.name}:`, e);
                    }
                }
            }

            const children = await getSubfolderNodes(folder.id);
            for (const child of children) {
                const subFolderPath = `${folderPath}/${child.name}`;
                const childFolder: TelegramFile = {
                    id: child.id,
                    name: child.name,
                    type: 'folder',
                    size: 0,
                    sizeStr: '0 B',
                    current_id: child.id,
                };
                const count = await downloadFolderRecursively(childFolder, subFolderPath, folderId);
                downloadedCount += count;
            }

            return downloadedCount;
        } catch (e) {
            console.error(`Failed to download folder ${folder.name}:`, e);
            return downloadedCount;
        }
    };

    const handleBulkMove = async (targetFolderId: number | null, targetVirtualFolderId: number | null, onSuccess?: () => void) => {
        if (selectedIds.length === 0) return;

        const filesToMove = displayedFiles.filter(f => selectedIds.includes(f.current_id ?? f.id));

        const folders = filesToMove.filter(f => f.type === 'folder');

        if (folders.length > 0) {
            const folderNames = folders.map(f => f.name).join(', ');

            if (!await confirm({
                title: "Move Folder with Contents",
                message: `Moving folder(s): ${folderNames}\n\nThis will move all files inside recursively. Continue?`,
                confirmText: "Move All",
                variant: 'info'
            })) {
                return;
            }

            toast.info('Moving folder contents recursively...');

            try {
                for (const folder of folders) {
                    await moveFolderRecursively(folder, targetFolderId, targetVirtualFolderId);
                }

                toast.success(`Moved ${folders.length} folder(s) with all contents.`);

                queryClient.invalidateQueries({ queryKey: ['files', activeFolderId, activeVirtualFolderId] });
                queryClient.invalidateQueries({ queryKey: ['files', targetFolderId, targetVirtualFolderId] });
                if (activeFolderId !== null) queryClient.invalidateQueries({ queryKey: ['folderTree', activeFolderId] });
                if (targetFolderId !== null) queryClient.invalidateQueries({ queryKey: ['folderTree', targetFolderId] });

                setSelectedIds([]);
                if (onSuccess) onSuccess();
                return;
            } catch (e) {
                console.error('[handleBulkMove] Folder move error:', e);
                toast.error(`Failed to move folder: ${e}`);
                return;
            }
        }

        try {
            if (targetFolderId !== activeFolderId) {
                const newMessageIds = await invoke<number[]>('cmd_move_files', {
                    messageIds: selectedIds,
                    sourceFolderId: activeFolderId,
                    targetFolderId: targetFolderId
                });

                if (targetVirtualFolderId !== null && newMessageIds.length > 0) {
                    try {
                        await invoke('cmd_move_to_virtual_folder', {
                            messageIds: newMessageIds,
                            folderId: targetFolderId,
                            targetVirtualFolderId: targetVirtualFolderId
                        });
                        toast.success(`Moved ${selectedIds.length} file(s) to target folder.`);
                    } catch (virtualMoveError) {
                        console.error('[handleBulkMove] Virtual folder move failed:', virtualMoveError);
                        toast.warning(`Files moved to drive root. Virtual folder placement failed: ${virtualMoveError}`);
                    }
                } else {
                    toast.success(`Moved ${selectedIds.length} file(s) to ${targetFolderId === null ? 'Saved Messages' : 'target drive'}.`);
                }

                queryClient.invalidateQueries({ queryKey: ['files', targetFolderId, targetVirtualFolderId] });
            } else {
                await invoke('cmd_move_to_virtual_folder', {
                    messageIds: selectedIds,
                    folderId: activeFolderId,
                    targetVirtualFolderId: targetVirtualFolderId
                });

                toast.success(`Moved ${selectedIds.length} file(s).`);

                if (targetVirtualFolderId !== null) {
                    queryClient.invalidateQueries({ queryKey: ['files', activeFolderId, targetVirtualFolderId] });
                }
            }

            queryClient.invalidateQueries({ queryKey: ['files', activeFolderId, activeVirtualFolderId] });
            if (activeFolderId !== null) queryClient.invalidateQueries({ queryKey: ['folderTree', activeFolderId] });
            if (targetFolderId !== null) queryClient.invalidateQueries({ queryKey: ['folderTree', targetFolderId] });

            setSelectedIds([]);
            if (onSuccess) onSuccess();
        } catch (e) {
            const errorStr = String(e);
            if (errorStr.includes('MESSAGE_ID_INVALID')) {
                if (errorStr.includes('forwardMessages')) {
                    toast.error('These files have invalid IDs. Try selecting the file again or contact support if this persists.');
                } else {
                    toast.error('Cannot move these files. Try selecting the file again or contact support if this persists.');
                }
            } else {
                toast.error(`Failed to move files: ${errorStr}`);
            }
        }
    };

    const moveFolderRecursively = async (folder: TelegramFile, targetFolderId: number | null, targetVirtualFolderId: number | null) => {
        const folderContents = await invoke<any[]>('cmd_get_files', {
            folderId: activeFolderId,
            virtualFolderId: folder.id
        });

        const subFiles = folderContents.filter((f: any) => f.icon_type !== 'folder' && !f.name.endsWith('/'));

        let newFolderId = targetVirtualFolderId;

        if (targetFolderId !== activeFolderId) {
            try {
                const createdFolder = await invoke<any>('cmd_create_virtual_folder', {
                    folderId: targetFolderId,
                    parentVirtualFolderId: targetVirtualFolderId,
                    name: folder.name.replace('/', '')
                });
                newFolderId = createdFolder.virtual_folder_id || createdFolder.id;
            } catch (e) {
                console.error(`[moveFolderRecursively] Failed to create folder:`, e);
                throw new Error(`Failed to create folder ${folder.name}: ${e}`);
            }
        } else {
            const folderMessageId = folder.current_id ?? folder.id;
            await invoke('cmd_move_to_virtual_folder', {
                messageIds: [folderMessageId],
                folderId: activeFolderId,
                targetVirtualFolderId: targetVirtualFolderId
            });
            newFolderId = folder.id;
        }

        if (subFiles.length > 0) {
            const fileIds = subFiles.map((f: any) => f.current_id ?? f.id);

            if (targetFolderId !== activeFolderId) {
                const newFileIds = await invoke<number[]>('cmd_move_files', {
                    messageIds: fileIds,
                    sourceFolderId: activeFolderId,
                    targetFolderId: targetFolderId
                });

                if (newFolderId && newFileIds.length > 0) {
                    await invoke('cmd_move_to_virtual_folder', {
                        messageIds: newFileIds,
                        folderId: targetFolderId,
                        targetVirtualFolderId: newFolderId
                    });
                }
            } else {
                await invoke('cmd_move_to_virtual_folder', {
                    messageIds: fileIds,
                    folderId: activeFolderId,
                    targetVirtualFolderId: newFolderId
                });
            }
        }

        // Get subfolders using tree (for drives) or cmd_get_files (for Saved Messages)
        const children = await getSubfolderNodes(folder.id);
        for (const child of children) {
            const childFolder: TelegramFile = {
                id: child.id,
                name: child.name + '/',
                type: 'folder',
                size: 0,
                sizeStr: '0 B',
                current_id: child.id,
            };
            await moveFolderRecursively(childFolder, targetFolderId, newFolderId);
        }

        if (targetFolderId !== activeFolderId) {
            const folderMessageId = folder.current_id ?? folder.id;
            try {
                await invoke('cmd_delete_file', {
                    messageId: folderMessageId,
                    folderId: activeFolderId
                });
            } catch (e) {
                console.error(`[moveFolderRecursively] Failed to delete source folder:`, e);
            }
        }
    };

    const handleDownloadFolder = async () => {
        if (displayedFiles.length === 0) {
            toast.info("Folder is empty.");
            return;
        }
        try {
            const dirPath = await import('@tauri-apps/plugin-dialog').then(d => d.open({
                directory: true, multiple: false, title: "Download Folder To..."
            }));
            if (!dirPath) return;

            const filesToDownload = displayedFiles.filter(f => f.type !== 'folder');
            if (filesToDownload.length === 0) {
                toast.info("No files to download in this folder.");
                return;
            }

            let successCount = 0;
            toast.info(`Downloading folder contents (${filesToDownload.length} files)...`);
            for (const file of filesToDownload) {
                const filePath = `${dirPath}/${file.name}`;
                try {
                    await invoke('cmd_download_file', {
                        messageId: file.current_id ?? file.id,
                        savePath: filePath,
                        folderId: activeFolderId
                    });
                    successCount++;
                } catch (e) {
                    console.error(`Failed to download ${file.name}:`, e);
                }
            }
            toast.success(`Folder Download Complete: ${successCount} files.`);
        } catch (e) {
            toast.error("Error: " + e);
        }
    }

    return {
        handleDelete,
        handleRename,
        handleBulkDelete,
        handleDownload,
        handleBulkDownload,
        handleBulkMove,
        handleDownloadFolder,
        handleGlobalSearch: async (query: string) => {
            try {
                return await invoke<TelegramFile[]>('cmd_search_global', { query });
            } catch {
                return [];
            }
        }
    };
}