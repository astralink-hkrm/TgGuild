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

interface DownloadEntry {
    file: TelegramFile;
    relativePath: string;
    isDirectory?: boolean;
}

export function useFileOperations(
    activeFolderId: number | null,
    activeVirtualFolderId: number | null,
    selectedIds: number[],
    setSelectedIds: (ids: number[]) => void,
    displayedFiles: TelegramFile[],
    currentFolderName: string,
    queueBulkDownload?: (entries: DownloadEntry[], folderId: number | null, currentFolderName: string) => Promise<void>,
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

    const handleRename = async (id: number, _currentName: string, newName: string) => {
        try {
            await invoke('cmd_rename_file', { messageId: id, folderId: activeFolderId, newName });
            invalidateCurrent();
            toast.success("File renamed");
        } catch (e) {
            toast.error(`Rename failed: ${e}`);
        }
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

    const collectFolderFiles = async (
        folder: TelegramFile,
        parentRelativePath: string,
    ): Promise<DownloadEntry[]> => {
        const entries: DownloadEntry[] = [];

        // Ensure the folder itself is created on disk, even if empty
        entries.push({ file: folder, relativePath: parentRelativePath, isDirectory: true });

        try {
            const contents = await invoke<any[]>('cmd_get_files', {
                folderId: activeFolderId,
                virtualFolderId: folder.id,
            });
            const files = contents.filter(
                (f: any) => f.icon_type !== 'folder' && !f.name.endsWith('/')
            );
            for (const f of files) {
                entries.push({
                    file: {
                        id: f.id,
                        name: f.name,
                        size: f.size || 0,
                        sizeStr: '',
                        current_id: f.current_id ?? f.id,
                        type: 'file',
                    } as TelegramFile,
                    relativePath: `${parentRelativePath}/${f.name}`,
                });
            }

            const children = await getSubfolderNodes(folder.id);
            for (const child of children) {
                const childFolder: TelegramFile = {
                    id: child.id,
                    name: child.name,
                    type: 'folder',
                    size: 0,
                    sizeStr: '0 B',
                    current_id: child.id,
                };
                const childEntries = await collectFolderFiles(
                    childFolder,
                    `${parentRelativePath}/${child.name}`,
                );
                entries.push(...childEntries);
            }
        } catch (e) {
            console.error(`Failed to collect folder ${folder.name}:`, e);
        }
        return entries;
    };

    const handleBulkDownload = async () => {
        if (selectedIds.length === 0) return;

        const itemsToDownload = displayedFiles.filter((f) => selectedIds.includes(f.current_id ?? f.id));
        const flatEntries: DownloadEntry[] = [];

        for (const item of itemsToDownload) {
            if (item.type !== 'folder') {
                flatEntries.push({ file: item, relativePath: item.name });
            } else {
                const folderEntries = await collectFolderFiles(item, item.name);
                flatEntries.push(...folderEntries);
            }
        }

        if (queueBulkDownload && flatEntries.length > 0) {
            await queueBulkDownload(flatEntries, activeFolderId, currentFolderName);
            setSelectedIds([]);
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

        const flatEntries: DownloadEntry[] = [];

        for (const item of displayedFiles) {
            if (item.type !== 'folder') {
                flatEntries.push({ file: item, relativePath: item.name });
            } else {
                const folderEntries = await collectFolderFiles(item, item.name);
                flatEntries.push(...folderEntries);
            }
        }

        if (queueBulkDownload) {
            await queueBulkDownload(flatEntries, activeFolderId, currentFolderName);
        }
    }

    return {
        handleDelete,
        handleRename,
        handleBulkDelete,
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