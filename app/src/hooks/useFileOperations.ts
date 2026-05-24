import { invoke } from '@tauri-apps/api/core';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { TelegramFile } from '../types';

export function useFileOperations(
    activeFolderId: number | null,
    activeVirtualFolderId: number | null,
    selectedIds: number[],
    setSelectedIds: (ids: number[]) => void,
    displayedFiles: TelegramFile[]
) {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();

    const handleDelete = async (id: number) => {
        if (!await confirm({ title: "Delete File", message: "Are you sure you want to delete this file?", confirmText: "Delete", variant: 'danger' })) return;
        try {
            await invoke('cmd_delete_file', { messageId: id, folderId: activeFolderId });
            queryClient.invalidateQueries({ queryKey: ['files', activeFolderId, activeVirtualFolderId] });
            toast.success("File deleted");
        } catch (e) {
            toast.error(`Delete failed: ${e}`);
        }
    }

    const handleRename = async (id: number, newName: string) => {
        try {
            await invoke('cmd_rename_file', { messageId: id, folderId: activeFolderId, newName });
            queryClient.invalidateQueries({ queryKey: ['files', activeFolderId, activeVirtualFolderId] });
            toast.success("File renamed");
        } catch (e) {
            toast.error(`Rename failed: ${e}`);
        }
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
        queryClient.invalidateQueries({ queryKey: ['files', activeFolderId, activeVirtualFolderId] });
        if (success > 0) toast.success(`Deleted ${success} files.`);
        if (fail > 0) toast.error(`Failed to delete ${fail} files.`);
    }

    const handleDownload = async (id: number, name: string) => {
        try {
            const savePath = await import('@tauri-apps/plugin-dialog').then(d => d.save({
                defaultPath: name,
            }));
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
            
            // Count total files including those in folders
            for (const folder of folders) {
                const count = await countFilesInFolder(folder.id);
                totalFiles += count;
            }
            
            toast.info(`Starting download of ${totalFiles} file(s)...`);
            
            // Download individual files
            for (const file of files) {
                const filePath = `${dirPath}/${file.name}`;
                try {
                    toast.info(`Downloading: ${file.name}`, { duration: 1000 });
                    await invoke('cmd_download_file', { 
                        messageId: file.current_id ?? file.id, 
                        savePath: filePath, 
                        folderId: activeFolderId 
                    });
                    downloadedCount++;
                } catch (e) {
                    const errorStr = String(e);
                    // Silently skip folder metadata messages
                    if (!errorStr.includes('No media in message')) {
                        console.error(`Failed to download ${file.name}:`, e);
                    }
                }
            }
            
            // Download folders recursively
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
            
            const files = contents.filter(f => f.type !== 'folder');
            const subFolders = contents.filter(f => f.type === 'folder');
            
            let count = files.length;
            for (const subFolder of subFolders) {
                count += await countFilesInFolder(subFolder.id);
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
            // Get folder contents
            const contents = await invoke<any[]>('cmd_get_files', { 
                folderId, 
                virtualFolderId: folder.id 
            });
            
            const files = contents.filter(f => f.type !== 'folder');
            const subFolders = contents.filter(f => f.type === 'folder');
            
            // Download files in this folder
            for (const file of files) {
                // Create folder path by downloading first file with folder structure
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
                    // Silently skip folder metadata messages
                    if (!errorStr.includes('No media in message')) {
                        console.error(`Failed to download ${file.name}:`, e);
                    }
                }
            }
            
            // Recursively download subfolders
            for (const subFolder of subFolders) {
                const subFolderPath = `${folderPath}/${subFolder.name.replace('/', '')}`;
                const count = await downloadFolderRecursively(subFolder, subFolderPath, folderId);
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
        
        console.log('[handleBulkMove] Starting move:', {
            selectedIds,
            activeFolderId,
            activeVirtualFolderId,
            targetFolderId,
            targetVirtualFolderId
        });
        
        // Log the actual files being moved
        const filesToMove = displayedFiles.filter(f => selectedIds.includes(f.current_id ?? f.id));
        console.log('[handleBulkMove] Files to move:', filesToMove.map(f => ({
            name: f.name,
            id: f.id,
            current_id: f.current_id,
            type: f.type,
            using_id: f.current_id ?? f.id
        })));
        
        // Check if any selected items are folders
        const folders = filesToMove.filter(f => f.type === 'folder');
        const files = filesToMove.filter(f => f.type !== 'folder');
        
        if (folders.length > 0) {
            // Recursive folder move
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
                // For each folder, get all files inside recursively and move them
                for (const folder of folders) {
                    await moveFolderRecursively(folder, targetFolderId, targetVirtualFolderId);
                }
                
                toast.success(`Moved ${folders.length} folder(s) with all contents.`);
                
                // Invalidate queries
                queryClient.invalidateQueries({ queryKey: ['files', activeFolderId, activeVirtualFolderId] });
                queryClient.invalidateQueries({ queryKey: ['files', targetFolderId, targetVirtualFolderId] });
                
                setSelectedIds([]);
                if (onSuccess) onSuccess();
                return;
            } catch (e) {
                console.error('[handleBulkMove] Folder move error:', e);
                toast.error(`Failed to move folder: ${e}`);
                return;
            }
        }
        
        // Regular file move (no folders)
        try {
            // Check if moving to a different drive or within the same drive
            if (targetFolderId !== activeFolderId) {
                // Moving to a different drive (cross-drive move)
                console.log('[handleBulkMove] Cross-drive move');
                console.log('[handleBulkMove] Using message IDs:', selectedIds);
                
                // Move files and get the new message IDs
                const newMessageIds = await invoke<number[]>('cmd_move_files', {
                    messageIds: selectedIds,
                    sourceFolderId: activeFolderId,
                    targetFolderId: targetFolderId
                });
                
                console.log('[handleBulkMove] Got new message IDs:', newMessageIds);
                
                // If target has a virtual folder, move to it using the NEW message IDs
                if (targetVirtualFolderId !== null && newMessageIds.length > 0) {
                    console.log('[handleBulkMove] Moving to virtual folder with new IDs:', {
                        newMessageIds,
                        targetFolderId,
                        targetVirtualFolderId
                    });
                    
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
                
                // Invalidate target folder queries
                queryClient.invalidateQueries({ queryKey: ['files', targetFolderId, targetVirtualFolderId] });
            } else {
                // Moving within the same drive to a virtual folder
                console.log('[handleBulkMove] Same-drive move to virtual folder');
                console.log('[handleBulkMove] Using message IDs:', selectedIds);
                await invoke('cmd_move_to_virtual_folder', {
                    messageIds: selectedIds,
                    folderId: activeFolderId,
                    targetVirtualFolderId: targetVirtualFolderId
                });
                
                toast.success(`Moved ${selectedIds.length} file(s).`);
                
                // Invalidate target virtual folder
                if (targetVirtualFolderId !== null) {
                    queryClient.invalidateQueries({ queryKey: ['files', activeFolderId, targetVirtualFolderId] });
                }
            }
            
            // Invalidate source queries
            queryClient.invalidateQueries({ queryKey: ['files', activeFolderId, activeVirtualFolderId] });
            
            setSelectedIds([]);
            if (onSuccess) onSuccess();
        } catch (e) {
            console.error('[handleBulkMove] Error:', e);
            console.error('[handleBulkMove] Error type:', typeof e);
            console.error('[handleBulkMove] Error details:', JSON.stringify(e, null, 2));
            
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
        // Get all files in this folder
        const folderContents = await invoke<any[]>('cmd_get_files', { 
            folderId: activeFolderId, 
            virtualFolderId: folder.id 
        });
        
        console.log(`[moveFolderRecursively] Moving folder ${folder.name} with ${folderContents.length} items`);
        
        // Separate files and subfolders
        const subFiles = folderContents.filter(f => !f.name.endsWith('/') && f.icon_type !== 'folder');
        const subFolders = folderContents.filter(f => f.name.endsWith('/') || f.icon_type === 'folder');
        
        // If moving to a different drive, we need to recreate the folder structure
        let newFolderId = targetVirtualFolderId;
        
        if (targetFolderId !== activeFolderId) {
            // Cross-drive move: create the folder in the target drive first
            try {
                const createdFolder = await invoke<any>('cmd_create_virtual_folder', {
                    folderId: targetFolderId,
                    parentVirtualFolderId: targetVirtualFolderId,
                    name: folder.name.replace('/', '')
                });
                newFolderId = createdFolder.virtual_folder_id || createdFolder.id;
                console.log(`[moveFolderRecursively] Created folder ${folder.name} in target, new ID: ${newFolderId}`);
            } catch (e) {
                console.error(`[moveFolderRecursively] Failed to create folder:`, e);
                throw new Error(`Failed to create folder ${folder.name}: ${e}`);
            }
        } else {
            // Same drive: just move the folder metadata
            const folderMessageId = folder.current_id ?? folder.id;
            await invoke('cmd_move_to_virtual_folder', {
                messageIds: [folderMessageId],
                folderId: activeFolderId,
                targetVirtualFolderId: targetVirtualFolderId
            });
            newFolderId = folder.id;
        }
        
        // Move all files in this folder
        if (subFiles.length > 0) {
            const fileIds = subFiles.map(f => f.current_id ?? f.id);
            console.log(`[moveFolderRecursively] Moving ${subFiles.length} files`);
            
            if (targetFolderId !== activeFolderId) {
                // Cross-drive: move files and then organize into folder
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
                // Same drive: just update parent
                await invoke('cmd_move_to_virtual_folder', {
                    messageIds: fileIds,
                    folderId: activeFolderId,
                    targetVirtualFolderId: newFolderId
                });
            }
        }
        
        // Recursively move subfolders
        for (const subFolder of subFolders) {
            await moveFolderRecursively(subFolder, targetFolderId, newFolderId);
        }
        
        // After moving all contents, delete the source folder if it's a cross-drive move
        if (targetFolderId !== activeFolderId) {
            const folderMessageId = folder.current_id ?? folder.id;
            console.log(`[moveFolderRecursively] Deleting source folder ${folder.name} (ID: ${folderMessageId})`);
            try {
                await invoke('cmd_delete_file', {
                    messageId: folderMessageId,
                    folderId: activeFolderId
                });
            } catch (e) {
                console.error(`[moveFolderRecursively] Failed to delete source folder:`, e);
                // Don't throw - the move was successful, just cleanup failed
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
            let successCount = 0;
            toast.info(`Downloading folder contents (${displayedFiles.length} files)...`);
            for (const file of displayedFiles) {
                const filePath = `${dirPath}/${file.name}`;
                try {
                    await invoke('cmd_download_file', { messageId: file.id, savePath: filePath, folderId: activeFolderId });
                    successCount++;
                } catch (e) { }
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
