import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Store } from '@tauri-apps/plugin-store';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '../context/ConfirmContext';
import { TelegramFolder } from '../types';
import { useNetworkStatus } from './useNetworkStatus';

export function useTelegramConnection(onLogoutParent: () => void) {
    const queryClient = useQueryClient();
    const { confirm } = useConfirm();

    const [folders, setFolders] = useState<TelegramFolder[]>([]);
    const [activeFolderId, setActiveFolderId] = useState<number | null>(null);
    const [store, setStore] = useState<Store | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isConnected, setIsConnected] = useState(true);


    const networkIsOnline = useNetworkStatus();

    const mergeFolderLists = (baseFolders: TelegramFolder[], scannedFolders: TelegramFolder[]) => {
        const byId = new Map<number, TelegramFolder>();
        baseFolders.forEach(folder => byId.set(folder.id, folder));
        
        // Only return folders that are in scannedFolders (source of truth)
        return scannedFolders.map(folder => ({
            ...byId.get(folder.id),
            ...folder
        })).sort((a, b) => a.name.localeCompare(b.name));
    };

    const refreshFoldersFromTelegram = async (
        targetStore: Store,
        baseFolders: TelegramFolder[],
        showToast: boolean,
    ) => {
        const foundFolders = await invoke<TelegramFolder[]>('cmd_scan_folders');
        const knownIds = new Set(baseFolders.map(folder => folder.id));
        const added = foundFolders.filter(folder => !knownIds.has(folder.id)).length;
        const merged = mergeFolderLists(baseFolders, foundFolders);

        setFolders(merged);
        await targetStore.set('folders', merged);
        await targetStore.save();

        if (showToast) {
            if (added > 0) {
                toast.success(`Scan complete. Found ${added} new drive${added === 1 ? '' : 's'}.`);
            } else {
                toast.info("Scan complete. No new drives found.");
            }
        }

        return merged;
    };

    useEffect(() => {
        const initStore = async () => {
            try {
                let _store = await Store.load('config.json');
                const checkId = await _store.get<string>('api_id');
                if (!checkId) {
                    _store = await Store.load('settings.json');
                }
                setStore(_store);

                const savedFolders = await _store.get<TelegramFolder[]>('folders');
                const initialFolders = savedFolders || [];
                if (savedFolders) setFolders(savedFolders);


                const savedActiveFolderId = await _store.get<number | null>('activeFolderId');
                if (savedActiveFolderId !== undefined) setActiveFolderId(savedActiveFolderId);

                const apiIdStr = await _store.get<string>('api_id');
                if (apiIdStr) {
                    try {
                        const apiId = parseInt(apiIdStr as string);
                        await invoke('cmd_connect', { apiId });
                        setIsConnected(true);
                        queryClient.invalidateQueries({ queryKey: ['files'] });
                    } catch {
                        // Retry loop: keep asking until the user succeeds or cancels
                        let connected = false;
                        while (!connected) {
                            const shouldRetry = await confirm({
                                title: "Connection Failed",
                                message: "Failed to connect to Telegram. Would you like to retry?",
                                confirmText: "Retry",
                                variant: 'danger'
                            });
                            if (!shouldRetry) {
                                // User chose cancel — clear credentials and log out
                                if (_store) {
                                    await _store.delete('api_id');
                                    await _store.save();
                                }
                                onLogoutParent();
                                return;
                            }
                            try {
                                const apiId = parseInt(apiIdStr as string);
                                await invoke('cmd_connect', { apiId });
                                setIsConnected(true);
                                queryClient.invalidateQueries({ queryKey: ['files'] });
                                connected = true;
                            } catch {
                                // Loop will show the confirm dialog again
                            }
                        }
                    }
                } else {
                    onLogoutParent();
                    return;
                }

                await refreshFoldersFromTelegram(_store, initialFolders, false).catch((error) => {
                    console.error('Initial drive scan failed:', error);
                });

            } catch {
                // store not available
            }
        };
        initStore();
    }, [queryClient, onLogoutParent, confirm]);


    useEffect(() => {
        setIsConnected(networkIsOnline);
    }, [networkIsOnline]);


    const isNetworkError = (error: string): boolean => {
        const keywords = ['timeout', 'connection', 'network', 'socket', 'disconnected', 'EOF', 'ECONNREFUSED', 'overflow'];
        return keywords.some(k => error.toLowerCase().includes(k.toLowerCase()));
    };

    const forceLogout = async () => {
        setIsConnected(false);
        try {
            await invoke('cmd_clean_cache').catch(() => { });
            if (store) {
                await store.delete('api_id');
                await store.delete('api_hash');
                await store.delete('folders');
                await store.save();
            }
        } catch {
            // best effort cleanup
        }
        toast.error("Connection lost. Please log in again.");
        onLogoutParent();
    };


    const handleLogout = async () => {
        if (!await confirm({ title: "Sign Out", message: "Are you sure you want to sign out? This will disconnect your active session.", confirmText: "Sign Out", variant: 'danger' })) return;

        try {
            await invoke('cmd_logout');
            await invoke('cmd_clean_cache');
            if (store) {
                await store.delete('api_id');
                await store.delete('api_hash');
                await store.delete('folders');
                await store.save();
            }
            onLogoutParent();
        } catch {
            toast.error("Error signing out");
            onLogoutParent();
        }
    };

    const handleSyncFolders = async () => {
        if (!store) return;
        setIsSyncing(true);
        try {
            await refreshFoldersFromTelegram(store, folders, true);
        } catch {
            toast.error("Sync failed");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleCreateFolder = async (name: string) => {
        if (!store) return;
        try {
            const newFolder = await invoke<TelegramFolder>('cmd_create_folder', { name });
            const updated = [...folders, newFolder];
            setFolders(updated);
            await store.set('folders', updated);
            await store.save();
            toast.success(`Folder "${name}" created.`);
        } catch (e) {
            toast.error("Failed to create folder: " + e);
            throw e;
        }
    };

    const handleFolderDelete = async (folderId: number, folderName: string) => {
        if (!await confirm({
            title: "Delete Folder",
            message: `Are you sure you want to delete "${folderName}"?\nThis will delete the channel on Telegram.`,
            confirmText: "Delete",
            variant: 'danger'
        })) return;

        try {
            await invoke('cmd_delete_folder', { folderId });
            const updated = folders.filter(f => f.id !== folderId);
            setFolders(updated);
            if (store) {
                await store.set('folders', updated);
                await store.save();
            }
            if (activeFolderId === folderId) setActiveFolderId(null);
            toast.success(`Folder "${folderName}" deleted.`);
        } catch (e: unknown) {
            const errStr = String(e);
            if (errStr.includes("not found")) {
                if (await confirm({
                    title: "Folder Not Found",
                    message: `Folder "${folderName}" not found on Telegram (it may have been deleted externally).\nRemove from this app?`,
                    confirmText: "Remove",
                    variant: 'info'
                })) {
                    const updated = folders.filter(f => f.id !== folderId);
                    setFolders(updated);
                    if (store) {
                        await store.set('folders', updated);
                        await store.save();
                    }
                    if (activeFolderId === folderId) setActiveFolderId(null);
                }
            } else {
                toast.error(`Failed to delete folder: ${e}`);
            }
        }
    };


    const handleSetActiveFolderId = async (id: number | null) => {
        setActiveFolderId(id);
        if (store) {
            await store.set('activeFolderId', id);
            await store.save();
        }
    };

    const handleFolderRename = async (folderId: number, currentName: string, newName: string) => {
        console.log("[useTelegramConnection] handleFolderRename called - folderId:", folderId, "currentName:", currentName, "newName:", newName);
        if (!store) return;
        try {
            console.log("[useTelegramConnection] Calling cmd_rename_folder with newName:", newName);
            await invoke('cmd_rename_folder', { folderId, newName });
            const updated = folders.map(f => f.id === folderId ? { ...f, name: newName } : f);
            setFolders(updated);
            await store.set('folders', updated);
            await store.save();
            toast.success(`Folder renamed to "${newName}".`);
        } catch (e) {
            toast.error(`Failed to rename folder: ${e}`);
            throw e;
        }
    };

    return {
        store,
        folders,
        activeFolderId,
        setActiveFolderId: handleSetActiveFolderId,
        isSyncing,
        isConnected,
        handleLogout,
        handleSyncFolders,
        handleCreateFolder,
        handleFolderRename,
        handleFolderDelete,
        isNetworkError,
        forceLogout
    };
}
