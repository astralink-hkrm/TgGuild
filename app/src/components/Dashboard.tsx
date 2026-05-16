import { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

import { TelegramFile, BandwidthStats } from '../types';
import { formatBytes } from '../utils';

import { Plus } from 'lucide-react';

// Components
import { Sidebar } from './dashboard/Sidebar';
import { TopBar } from './dashboard/TopBar';
import { FileExplorer } from './dashboard/FileExplorer';
import { TeamChat } from './dashboard/TeamChat';
import { MemberStack } from './dashboard/MemberStack';
import { AddSubscriberModal } from './dashboard/AddSubscriberModal';
import { UploadQueue } from './dashboard/UploadQueue';
import { DownloadQueue } from './dashboard/DownloadQueue';
import { MoveToFolderModal } from './dashboard/MoveToFolderModal';
import { ShareFilesModal } from './dashboard/ShareFilesModal';
import { DragDropOverlay } from './dashboard/DragDropOverlay';
import { ExternalDropBlocker } from './dashboard/ExternalDropBlocker';

// Hooks
import { useTelegramConnection } from '../hooks/useTelegramConnection';
import { useFileOperations } from '../hooks/useFileOperations';
import { useFileUpload } from '../hooks/useFileUpload';
import { useFileDownload } from '../hooks/useFileDownload';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

export function Dashboard({ onLogout }: { onLogout: () => void }) {
    const queryClient = useQueryClient();

    const {
        store, folders, activeFolderId, setActiveFolderId, isSyncing, isConnected,
        handleLogout, handleSyncFolders, handleCreateFolder, handleFolderRename, handleFolderDelete
    } = useTelegramConnection(onLogout);

    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [activeVirtualFolderId, setActiveVirtualFolderId] = useState<number | null>(null);
    const [virtualFolderStack, setVirtualFolderStack] = useState<TelegramFile[]>([]);
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [searchResults, setSearchResults] = useState<TelegramFile[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [internalDragFileId, _setInternalDragFileId] = useState<number | null>(null);
    const [activeCompanyManagement, setActiveCompanyManagement] = useState(false);
    const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
    const [activeDirectChat, setActiveDirectChat] = useState<any | null>(null);
    const [groups, setGroups] = useState<{id: number, name: string, username: string | null, member_count: number}[]>([]);
    const [activeMembers, setActiveMembers] = useState<any[]>([]);
    const [showAddSubscriber, setShowAddSubscriber] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const internalDragRef = useRef<number | null>(null);

    const loadGroups = async () => {
        try {
            const result = await invoke<{id: number, name: string, username: string | null, member_count: number}[]>('cmd_get_teams');
            setGroups(result);
        } catch (e) {
            console.error('Failed to load groups:', e);
        }
    };

    const loadActiveMembers = async (id: number | null) => {
        if (id === null) {
            setActiveMembers([]);
            return;
        }
        try {
            const result = await invoke<any[]>('cmd_get_team_members', { teamId: id });
            setActiveMembers(result);
        } catch (e) {
            console.error('Failed to load members:', e);
            setActiveMembers([]);
        }
    };

    useEffect(() => {
        loadGroups();
        invoke<{ user_id: string } | null>('cmd_get_current_user')
            .then((user) => setCurrentUserId(user?.user_id || null))
            .catch(console.error);
    }, []);

    useEffect(() => {
        loadActiveMembers(activeFolderId || activeGroupId);
    }, [activeFolderId, activeGroupId]);

    const setInternalDragFileId = (id: number | null) => {
        internalDragRef.current = id;
        _setInternalDragFileId(id);
    };

    useEffect(() => {
        if (store) {
            store.get<'grid' | 'list'>('viewMode').then((saved) => {
                if (saved) setViewMode(saved);
            });
        }
    }, [store]);

    useEffect(() => {
        if (store) {
            store.set('viewMode', viewMode).then(() => store.save());
        }
    }, [store, viewMode]);

    const { data: allFiles = [], isLoading, error } = useQuery({
        queryKey: ['files', activeFolderId, activeVirtualFolderId],
        queryFn: () => invoke<any[]>('cmd_get_files', { folderId: activeFolderId, virtualFolderId: activeVirtualFolderId }).then(res => res.map(f => ({
            ...f,
            sizeStr: formatBytes(f.size),
            type: f.icon_type || (f.name.endsWith('/') ? 'folder' : 'file')
        }))),
        enabled: !!store,
    });

    const displayedFiles = searchTerm.length > 2
        ? searchResults
        : allFiles.filter((f: TelegramFile) => f.name.toLowerCase().includes(searchTerm.toLowerCase()));

    const { data: bandwidth } = useQuery({
        queryKey: ['bandwidth'],
        queryFn: () => invoke<BandwidthStats>('cmd_get_bandwidth'),
        refetchInterval: 5000,
        enabled: !!store
    });

    const {
        handleDelete, handleRename, handleBulkDelete, handleBulkDownload,
        handleBulkMove, handleDownloadFolder, handleGlobalSearch
    } = useFileOperations(activeFolderId, activeVirtualFolderId, selectedIds, setSelectedIds, displayedFiles);

    const { uploadQueue, setUploadQueue, handleManualUpload, cancelAll: cancelUploads, cancelItem: cancelUploadItem, retryItem: retryUploadItem, isDragging } = useFileUpload(activeFolderId, store, activeVirtualFolderId);
    const { downloadQueue, queueDownload, clearFinished: clearDownloads, cancelAll: cancelDownloads, cancelItem: cancelDownloadItem, retryItem: retryDownloadItem, openWithSystemApp } = useFileDownload(store);

    const handleSelectAll = useCallback(() => {
        const visibleIds = displayedFiles.map(f => f.id);
        const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.includes(id));
        setSelectedIds(allVisibleSelected ? [] : visibleIds);
    }, [displayedFiles, selectedIds]);

    const handleShareFiles = useCallback(async (targetFolderId: number | null) => {
        if (selectedIds.length === 0) return;
        try {
            await invoke('cmd_share_files', {
                messageIds: selectedIds,
                sourceFolderId: activeFolderId,
                targetFolderId,
            });
            toast.success(`Shared ${selectedIds.length} file(s).`);
            setSelectedIds([]);
        } catch (e) {
            toast.error(`Share failed: ${e}`);
            throw e;
        }
    }, [selectedIds, activeFolderId]);

    const handleKeyboardDelete = useCallback(() => {
        if (selectedIds.length > 0) {
            handleBulkDelete();
        }
    }, [selectedIds, handleBulkDelete]);

    const handleEscape = useCallback(() => {
        setSelectedIds([]);
        setSearchTerm("");
    }, []);

    const handleFocusSearch = useCallback(() => {
        const searchInput = document.querySelector('input[placeholder="Search files..."]') as HTMLInputElement;
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    }, []);

    const handleEnter = useCallback(() => {
        if (selectedIds.length === 1) {
            const selected = displayedFiles.find(f => f.id === selectedIds[0]);
            if (selected && selected.type !== 'folder') {
                openWithSystemApp(selected.id, selected.name, activeFolderId);
            }
        }
    }, [selectedIds, displayedFiles, activeFolderId, openWithSystemApp]);

    useKeyboardShortcuts({
        onSelectAll: handleSelectAll,
        onDelete: handleKeyboardDelete,
        onEscape: handleEscape,
        onSearch: handleFocusSearch,
        onEnter: handleEnter,
        enabled: !showMoveModal && !showShareModal
    });

    useEffect(() => {
        setSelectedIds([]);
        setShowMoveModal(false);
        setShowShareModal(false);
        setSearchTerm("");
        setSearchResults([]);
        setActiveVirtualFolderId(null);
        setVirtualFolderStack([]);
    }, [activeFolderId]);

    useEffect(() => {
        if (searchTerm.length <= 2) {
            setSearchResults([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearching(true);
            const results = await handleGlobalSearch(searchTerm);
            setSearchResults(results);
            setIsSearching(false);
        }, 500);

        return () => clearTimeout(timer);
    }, [searchTerm]);

    const handleFileClick = (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey) {
            setSelectedIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
        } else {
            setSelectedIds([id]);
        }
    }

    const handleToggleSelection = useCallback((id: number) => {
        setSelectedIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);
    }, []);

    const handleOpenFile = (file: TelegramFile) => {
        if (file.type === 'folder') {
            setActiveVirtualFolderId(file.id);
            setVirtualFolderStack(stack => [...stack, file]);
            setSelectedIds([]);
        } else {
            openWithSystemApp(file.id, file.name, activeFolderId);
        }
    };

    const handleCreateVirtualFolder = async () => {
        const name = prompt('Folder name:');
        if (!name?.trim()) return;
        try {
            await invoke('cmd_create_virtual_folder', {
                folderId: activeFolderId,
                parentVirtualFolderId: activeVirtualFolderId,
                name: name.trim(),
            });
            queryClient.invalidateQueries({ queryKey: ['files', activeFolderId, activeVirtualFolderId] });
            toast.success('Folder created');
        } catch (e) {
            toast.error(`Failed to create folder: ${e}`);
        }
    };

    const handleVirtualBreadcrumb = (index: number) => {
        if (index < 0) {
            setActiveVirtualFolderId(null);
            setVirtualFolderStack([]);
        } else {
            const nextStack = virtualFolderStack.slice(0, index + 1);
            setVirtualFolderStack(nextStack);
            setActiveVirtualFolderId(nextStack[nextStack.length - 1]?.id ?? null);
        }
        setSelectedIds([]);
    };

    const handleDropOnFolder = async (e: React.DragEvent, targetFolderId: number | null) => {
        e.preventDefault();
        e.stopPropagation();

        const dataTransferFileId = e.dataTransfer.getData("application/x-telegram-file-id");

        if (activeFolderId === targetFolderId) return;

        const fileId = internalDragRef.current || (dataTransferFileId ? parseInt(dataTransferFileId) : null);

        if (fileId) {
            try {
                const idsToMove = selectedIds.includes(fileId) ? selectedIds : [fileId];

                await invoke('cmd_move_files', {
                    messageIds: idsToMove,
                    sourceFolderId: activeFolderId,
                    targetFolderId: targetFolderId
                });

                queryClient.invalidateQueries({ queryKey: ['files', activeFolderId] });

                if (selectedIds.includes(fileId)) setSelectedIds([]);

                toast.success(`Moved ${idsToMove.length} file(s).`);

                setInternalDragFileId(null);
            } catch {
                toast.error(`Failed to move file(s).`);
            }
        }
    }

    const currentFolderName = activeFolderId === null
        ? "Saved Messages"
        : folders.find(f => f.id === activeFolderId)?.name || "Folder";
    const currentDrivePath = [currentFolderName, ...virtualFolderStack.map(folder => folder.name)].join(' / ');

    const canManageActiveGroup = activeGroupId !== null && activeMembers.some(member => (
        String(member.user_id) === currentUserId && (member.is_admin || member.is_owner)
    ));

    const handleRootDragOver = (e: React.DragEvent) => {
        if (internalDragRef.current) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
        }
    };

    const handleRootDragEnter = (e: React.DragEvent) => {
        if (internalDragRef.current) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
        }
    };

    return (
        <div
            className="flex h-screen w-full overflow-hidden bg-telegram-bg relative"
            onClick={() => setSelectedIds([])}
            onDragOver={handleRootDragOver}
            onDragEnter={handleRootDragEnter}
        >
            <ExternalDropBlocker onUploadClick={handleManualUpload} />

            <AnimatePresence>
                {showMoveModal && (
                    <MoveToFolderModal
                        folders={folders}
                        onClose={() => setShowMoveModal(false)}
                        onSelect={handleBulkMove}
                        activeFolderId={activeFolderId}
                        key="move-modal"
                    />
                )}
                {showShareModal && (
                    <ShareFilesModal
                        folders={folders}
                        selectedCount={selectedIds.length}
                        onClose={() => setShowShareModal(false)}
                        onShare={handleShareFiles}
                        key="share-files-modal"
                    />
                )}
                {isDragging && internalDragFileId === null && <DragDropOverlay key="drag-drop-overlay" />}
            </AnimatePresence>

            <Sidebar
                folders={folders}
                activeFolderId={activeFolderId}
                setActiveFolderId={setActiveFolderId}
                activeGroupId={activeGroupId}
                setActiveGroupId={setActiveGroupId}
                activeDirectChatId={activeDirectChat?.user_id || null}
                setActiveDirectChat={setActiveDirectChat}
                activeCompanyManagement={activeCompanyManagement}
                setActiveCompanyManagement={setActiveCompanyManagement}
                onDrop={handleDropOnFolder}
                onDelete={handleFolderDelete}
                onRename={handleFolderRename}
                onCreate={handleCreateFolder}
                isSyncing={isSyncing}
                isConnected={isConnected}
                onSync={handleSyncFolders}
                onLogout={handleLogout}
                bandwidth={bandwidth || null}
            />

            <main className="flex-1 flex flex-col overflow-hidden" onClick={(e) => { if (e.target === e.currentTarget) setSelectedIds([]); }}>
                {activeCompanyManagement ? (
                    <div className="flex-1 flex flex-col min-h-0 relative">
                        <TeamChat
                            groupId={null}
                            groupName="Company Management"
                            isDirect
                        />
                    </div>
                ) : activeDirectChat ? (
                    <div className="flex-1 flex flex-col min-h-0 relative">
                        <TeamChat
                            groupId={Number(activeDirectChat.user_id)}
                            groupName={`${activeDirectChat.first_name} ${activeDirectChat.last_name || ''}`.trim()}
                            isDirect
                        />
                    </div>
                ) : activeGroupId !== null ? (
                    <div className="flex-1 flex flex-col min-h-0 relative">
                        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
                            <MemberStack members={activeMembers} size="sm" />
                            {canManageActiveGroup && (
                                <button
                                    onClick={() => setShowAddSubscriber(true)}
                                    className="w-8 h-8 rounded-full bg-telegram-primary/10 hover:bg-telegram-primary/20 text-telegram-primary flex items-center justify-center transition-all shadow-sm active:scale-95"
                                    title="Add Member"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <TeamChat 
                            groupId={activeGroupId} 
                            groupName={groups.find(g => g.id === activeGroupId)?.name || 'Group Chat'}
                            memberCount={groups.find(g => g.id === activeGroupId)?.member_count || activeMembers.length}
                            canManageMembers={canManageActiveGroup}
                            mentionableMembers={activeMembers}
                            onManageMembers={() => setShowAddSubscriber(true)}
                        />
                    </div>
                ) : (
                    <>
                        <TopBar
                            currentFolderName={currentDrivePath}
                            onDownloadFolder={handleDownloadFolder}
                            viewMode={viewMode}
                            setViewMode={setViewMode}
                            searchTerm={searchTerm}
                            onSearchChange={setSearchTerm}
                            members={activeMembers}
                            onAddSubscriber={activeFolderId ? () => setShowAddSubscriber(true) : undefined}
                        />
                        {searchTerm.length > 2 && (
                            <div className="px-6 pt-4 pb-0">
                                <h2 className="text-sm font-medium text-telegram-subtext">
                                    Search Results for <span className="text-telegram-primary">"{searchTerm}"</span>
                                </h2>
                            </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 px-6 pt-4 text-xs text-telegram-subtext">
                            <button
                                onClick={() => handleVirtualBreadcrumb(-1)}
                                className={`rounded px-2 py-1 transition-colors hover:bg-telegram-hover hover:text-telegram-text ${activeVirtualFolderId === null ? 'text-telegram-primary' : ''}`}
                            >
                                {currentFolderName}
                            </button>
                            {virtualFolderStack.map((folder, index) => (
                                <span key={folder.id} className="flex items-center gap-2">
                                    <span>/</span>
                                    <button
                                        onClick={() => handleVirtualBreadcrumb(index)}
                                        className={`rounded px-2 py-1 transition-colors hover:bg-telegram-hover hover:text-telegram-text ${index === virtualFolderStack.length - 1 ? 'text-telegram-primary' : ''}`}
                                    >
                                        {folder.name}
                                    </button>
                                </span>
                            ))}
                        </div>
                        <FileExplorer
                            files={displayedFiles}
                            loading={isLoading || isSearching}
                            error={error}
                            viewMode={viewMode}
                            selectedIds={selectedIds}
                            activeFolderId={activeFolderId}
                            onFileClick={handleFileClick}
                            onDelete={handleDelete}
                            onRename={handleRename}
                            onDownload={(id, name) => queueDownload(id, name, activeFolderId)}
                            onOpen={handleOpenFile}
                            onManualUpload={handleManualUpload}
                            onCreateFolder={handleCreateVirtualFolder}
                            onSelectionClear={() => setSelectedIds([])}
                            onToggleSelection={handleToggleSelection}
                            onSelectAll={handleSelectAll}
                            onShowMoveModal={() => setShowMoveModal(true)}
                            onShowShareModal={() => setShowShareModal(true)}
                            onBulkDownload={handleBulkDownload}
                            onBulkDelete={handleBulkDelete}
                            onDrop={handleDropOnFolder}
                            onDragStart={(fileId) => setInternalDragFileId(fileId)}
                            onDragEnd={() => setTimeout(() => setInternalDragFileId(null), 50)}
                        />
                    </>
                )}
            </main>

            <UploadQueue
                items={uploadQueue}
                onClearFinished={() => setUploadQueue(q => q.filter(i => i.status !== 'success' && i.status !== 'error' && i.status !== 'cancelled'))}
                onCancelAll={cancelUploads}
                onCancelItem={cancelUploadItem}
                onRetryItem={retryUploadItem}
            />
            <DownloadQueue
                items={downloadQueue}
                onClearFinished={clearDownloads}
                onCancelAll={cancelDownloads}
                onCancelItem={cancelDownloadItem}
                onRetryItem={retryDownloadItem}
            />

            {showAddSubscriber && (activeFolderId || activeGroupId) && (
                <AddSubscriberModal
                    teamId={(activeFolderId || activeGroupId)!}
                    canManageMembers={activeGroupId !== null ? canManageActiveGroup : true}
                    onClose={() => setShowAddSubscriber(false)}
                    onSuccess={() => loadActiveMembers(activeFolderId || activeGroupId)}
                />
            )}
        </div>
    );
}
