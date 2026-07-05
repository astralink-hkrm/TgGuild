import { useState, useRef, useEffect } from 'react';
import { Plus, Folder, ChevronDown, ChevronRight, Loader2, HardDrive, AlertCircle } from 'lucide-react';
import { TelegramFolder, FolderTreeNode } from '../../types';
import { invoke } from '@tauri-apps/api/core';

interface MoveToFolderModalProps {
    onClose: () => void;
    onSelect: (targetFolderId: number | null, targetVirtualFolderId: number | null) => void;
    activeVirtualFolderId: number | null;
    activeFolderId: number | null;
    folders: TelegramFolder[];
}

export function MoveToFolderModal({ onClose, onSelect, activeVirtualFolderId, activeFolderId, folders }: MoveToFolderModalProps) {
    const [isMoving, setIsMoving] = useState(false);
    const [expandedDrives, setExpandedDrives] = useState<Set<number | null>>(new Set());
    const [expandedVirtualFolders, setExpandedVirtualFolders] = useState<Set<string>>(new Set());
    const [folderTrees, setFolderTrees] = useState<Map<number | null, FolderTreeNode[]>>(new Map());
    const [loadingDrives, setLoadingDrives] = useState<Set<number | null>>(new Set());
    const [errorDrives, setErrorDrives] = useState<Set<number | null>>(new Set());
    const [selectedDestination, setSelectedDestination] = useState<{ folderId: number | null; virtualFolderId: number | null } | null>(null);
    const mountedRef = useRef(true);
    const loadingRef = useRef(new Set<number | null>());

    useEffect(() => {
        return () => { mountedRef.current = false; };
    }, []);

    const loadTree = async (driveId: number | null) => {
        if (loadingRef.current.has(driveId)) return;
        if (folderTrees.has(driveId)) return;
        loadingRef.current.add(driveId);
        setLoadingDrives(prev => new Set(prev).add(driveId));
        setErrorDrives(prev => { const next = new Set(prev); next.delete(driveId); return next; });
        try {
            const tree = await invoke<FolderTreeNode[]>('cmd_get_folder_tree', { folderId: driveId });
            if (!mountedRef.current) return;
            setFolderTrees(prev => new Map(prev).set(driveId, tree));
        } catch {
            if (!mountedRef.current) return;
            setErrorDrives(prev => new Set(prev).add(driveId));
        } finally {
            loadingRef.current.delete(driveId);
            if (!mountedRef.current) return;
            setLoadingDrives(prev => { const next = new Set(prev); next.delete(driveId); return next; });
        }
    };

    const toggleDrive = (driveId: number | null) => {
        setExpandedDrives(prev => {
            const newSet = new Set(prev);
            if (newSet.has(driveId)) {
                newSet.delete(driveId);
            } else {
                newSet.add(driveId);
                loadTree(driveId);
            }
            return newSet;
        });
    };

    const toggleVirtualFolder = (folderId: number | null, virtualFolderId: number) => {
        const key = `${folderId}-${virtualFolderId}`;
        setExpandedVirtualFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    };

    const handleMove = async () => {
        if (!selectedDestination) return;
        setIsMoving(true);
        try {
            await onSelect(selectedDestination.folderId, selectedDestination.virtualFolderId);
            onClose();
        } finally {
            setIsMoving(false);
        }
    };

    const renderTreeNodes = (nodes: FolderTreeNode[], parentDriveId: number | null, level: number = 0) => {
        return nodes.map(node => {
            const key = `${parentDriveId}-${node.id}`;
            const isExpanded = expandedVirtualFolders.has(key);
            const hasChildren = node.children.length > 0;
            const isCurrentLocation = parentDriveId === activeFolderId && node.id === activeVirtualFolderId;
            const isSelected = selectedDestination?.folderId === parentDriveId && selectedDestination?.virtualFolderId === node.id;

            return (
                <div key={node.id}>
                    <div
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                            isCurrentLocation
                                ? 'opacity-50 cursor-not-allowed'
                                : isSelected
                                ? 'bg-telegram-primary/20 text-telegram-primary'
                                : 'text-telegram-text hover:bg-telegram-hover cursor-pointer'
                        }`}
                        style={{ paddingLeft: `${(level + 2) * 12}px` }}
                    >
                        {hasChildren ? (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleVirtualFolder(parentDriveId, node.id);
                                }}
                                className="p-0.5 hover:bg-telegram-border rounded flex-shrink-0"
                            >
                                {isExpanded ? (
                                    <ChevronDown className="w-3 h-3" />
                                ) : (
                                    <ChevronRight className="w-3 h-3" />
                                )}
                            </button>
                        ) : (
                            <div className="w-4 flex-shrink-0" />
                        )}
                        <div
                            onClick={() => {
                                if (!isCurrentLocation) {
                                    setSelectedDestination({ folderId: parentDriveId, virtualFolderId: node.id });
                                }
                            }}
                            className="flex items-center gap-2 flex-1 min-w-0"
                        >
                            <Folder className="w-4 h-4 flex-shrink-0 text-telegram-subtext" />
                            <span className="truncate">{node.name}</span>
                        </div>
                    </div>

                    {isExpanded && hasChildren && renderTreeNodes(node.children, parentDriveId, level + 1)}
                </div>
            );
        });
    };

    const renderDriveSection = (driveId: number | null, name: string, icon: React.ReactNode) => {
        const isExpanded = expandedDrives.has(driveId);
        const isLoading = loadingDrives.has(driveId);
        const hasError = errorDrives.has(driveId);
        const tree = folderTrees.get(driveId);
        const hasFolders = tree && tree.length > 0;

        return (
            <div className="border-b border-telegram-border/50 last:border-b-0">
                <button
                    onClick={() => toggleDrive(driveId)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-telegram-text hover:bg-telegram-hover transition-colors"
                >
                    {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-telegram-subtext" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-telegram-subtext" />
                    )}
                    {icon}
                    <span>{name}</span>
                </button>

                {isExpanded && (
                    <div className="pb-2">
                        <button
                            onClick={() => setSelectedDestination({ folderId: driveId, virtualFolderId: null })}
                            disabled={activeFolderId === driveId && activeVirtualFolderId === null}
                            className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-left transition-colors ${
                                activeFolderId === driveId && activeVirtualFolderId === null
                                    ? 'opacity-50 cursor-not-allowed'
                                    : selectedDestination?.folderId === driveId && selectedDestination?.virtualFolderId === null
                                    ? 'bg-telegram-primary/20 text-telegram-primary'
                                    : 'text-telegram-text hover:bg-telegram-hover'
                            }`}
                            style={{ paddingLeft: '36px' }}
                        >
                            <Folder className="w-4 h-4 text-telegram-subtext" />
                            <span className="font-medium">Root</span>
                        </button>

                        {isLoading && (
                            <div className="flex items-center gap-2 px-3 py-3 text-sm text-telegram-subtext" style={{ paddingLeft: '36px' }}>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Loading folders...</span>
                            </div>
                        )}

                        {hasError && (
                            <button
                                onClick={() => loadTree(driveId)}
                                className="flex items-center gap-2 px-3 py-3 text-sm text-orange-400 hover:text-orange-300 transition-colors"
                                style={{ paddingLeft: '36px' }}
                            >
                                <AlertCircle className="w-3.5 h-3.5" />
                                <span>Failed to load. Click to retry.</span>
                            </button>
                        )}

                        {!isLoading && !hasError && hasFolders && renderTreeNodes(tree!, driveId, 0)}

                        {!isLoading && !hasError && !hasFolders && (
                            <div className="px-3 py-3 text-xs text-telegram-subtext/60" style={{ paddingLeft: '36px' }}>
                                No folders yet
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-telegram-surface border border-telegram-border rounded-xl w-[520px] shadow-2xl max-h-[600px] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-telegram-border flex justify-between items-center shrink-0">
                    <h3 className="text-telegram-text font-medium">Move to Folder</h3>
                    <button onClick={onClose} className="text-telegram-subtext hover:text-telegram-text">
                        <Plus className="w-5 h-5 rotate-45" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    {folders.map(drive => renderDriveSection(
                        drive.id,
                        drive.name,
                        <HardDrive className="w-4 h-4 text-telegram-subtext" />
                    ))}
                </div>

                <div className="p-4 border-t border-telegram-border flex justify-end gap-2 shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-telegram-subtext hover:text-telegram-text transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleMove}
                        disabled={isMoving || !selectedDestination}
                        className="flex items-center gap-2 px-4 py-2 bg-telegram-primary text-white text-sm font-medium rounded-lg hover:bg-telegram-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isMoving ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Moving...
                            </>
                        ) : (
                            'Move here'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
