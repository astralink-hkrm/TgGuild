import { useState, useEffect } from 'react';
import { Plus, Folder, ChevronDown, ChevronRight, Loader2, HardDrive, LayoutGrid } from 'lucide-react';
import { TelegramFile, TelegramFolder } from '../../types';
import { invoke } from '@tauri-apps/api/core';

interface MoveToFolderModalProps {
    virtualFolders: TelegramFile[];
    onClose: () => void;
    onSelect: (targetFolderId: number | null, targetVirtualFolderId: number | null) => void;
    activeVirtualFolderId: number | null;
    activeFolderId: number | null;
    folders: TelegramFolder[];
}

interface DriveFolder {
    id: number | null;
    name: string;
    isExpanded: boolean;
    virtualFolders: TelegramFile[];
}

export function MoveToFolderModal({ virtualFolders, onClose, onSelect, activeVirtualFolderId, activeFolderId, folders }: MoveToFolderModalProps) {
    const [isMoving, setIsMoving] = useState(false);
    const [expandedDrives, setExpandedDrives] = useState<Set<number | null>>(new Set([activeFolderId]));
    const [expandedVirtualFolders, setExpandedVirtualFolders] = useState<Set<string>>(new Set());
    const [allVirtualFolders, setAllVirtualFolders] = useState<Map<number | null, TelegramFile[]>>(new Map());
    const [selectedDestination, setSelectedDestination] = useState<{ folderId: number | null; virtualFolderId: number | null } | null>(null);

    useEffect(() => {
        loadAllVirtualFolders();
    }, [folders]);

    const loadAllVirtualFolders = async () => {
        try {
            const virtualFoldersMap = new Map<number | null, TelegramFile[]>();
            
            // Load for Saved Messages
            const savedMessagesVirtual = await invoke<any[]>('cmd_get_files', { folderId: null, virtualFolderId: null });
            virtualFoldersMap.set(null, savedMessagesVirtual.filter(f => f.name.endsWith('/') || f.icon_type === 'folder'));
            
            // Load for each drive
            for (const folder of folders) {
                const driveVirtual = await invoke<any[]>('cmd_get_files', { folderId: folder.id, virtualFolderId: null });
                virtualFoldersMap.set(folder.id, driveVirtual.filter(f => f.name.endsWith('/') || f.icon_type === 'folder'));
            }
            
            setAllVirtualFolders(virtualFoldersMap);
        } catch (e) {
            console.error('Failed to load virtual folders:', e);
        }
    };

    const loadSubfolders = async (folderId: number | null, virtualFolderId: number) => {
        const key = `${folderId}-${virtualFolderId}`;
        if (expandedVirtualFolders.has(key)) {
            // Already loaded, just toggle
            return;
        }

        try {
            const subfolders = await invoke<any[]>('cmd_get_files', { folderId, virtualFolderId });
            const folders = subfolders.filter(f => f.name.endsWith('/') || f.icon_type === 'folder');
            
            // Update the map with subfolders
            setAllVirtualFolders(prev => {
                const newMap = new Map(prev);
                newMap.set(virtualFolderId, folders);
                return newMap;
            });
        } catch (e) {
            console.error('Failed to load subfolders:', e);
        }
    };

    const toggleDrive = (driveId: number | null) => {
        setExpandedDrives(prev => {
            const newSet = new Set(prev);
            if (newSet.has(driveId)) {
                newSet.delete(driveId);
            } else {
                newSet.add(driveId);
            }
            return newSet;
        });
    };

    const toggleVirtualFolder = async (folderId: number | null, virtualFolderId: number) => {
        const key = `${folderId}-${virtualFolderId}`;
        
        if (!expandedVirtualFolders.has(key)) {
            await loadSubfolders(folderId, virtualFolderId);
        }
        
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

    const renderVirtualFolder = (folder: TelegramFile, folderId: number | null, level: number = 0) => {
        const key = `${folderId}-${folder.id}`;
        const isExpanded = expandedVirtualFolders.has(key);
        const subfolders = allVirtualFolders.get(folder.id) || [];
        const hasSubfolders = subfolders.length > 0 || !expandedVirtualFolders.has(key);
        const isCurrentLocation = folderId === activeFolderId && folder.id === activeVirtualFolderId;
        const isSelected = selectedDestination?.folderId === folderId && selectedDestination?.virtualFolderId === folder.id;

        return (
            <div key={folder.id}>
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
                    {hasSubfolders ? (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleVirtualFolder(folderId, folder.id);
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
                                setSelectedDestination({ folderId, virtualFolderId: folder.id });
                            }
                        }}
                        className="flex items-center gap-2 flex-1 min-w-0"
                    >
                        <Folder className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{folder.name.replace('/', '')}</span>
                    </div>
                </div>
                
                {isExpanded && subfolders.map(subfolder => 
                    renderVirtualFolder(subfolder, folderId, level + 1)
                )}
            </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-telegram-surface border border-telegram-border rounded-xl w-[500px] shadow-2xl max-h-[600px] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-telegram-border flex justify-between items-center shrink-0">
                    <h3 className="text-telegram-text font-medium">Move to Folder</h3>
                    <button onClick={onClose} className="text-telegram-subtext hover:text-telegram-text">
                        <Plus className="w-5 h-5 rotate-45" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    {/* Saved Messages */}
                    <div className="border-b border-telegram-border/50">
                        <button
                            onClick={() => toggleDrive(null)}
                            className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-telegram-text hover:bg-telegram-hover transition-colors"
                        >
                            {expandedDrives.has(null) ? (
                                <ChevronDown className="w-4 h-4" />
                            ) : (
                                <ChevronRight className="w-4 h-4" />
                            )}
                            <LayoutGrid className="w-4 h-4" />
                            <span>Saved Messages</span>
                        </button>
                        
                        {expandedDrives.has(null) && (
                            <div>
                                <button
                                    onClick={() => setSelectedDestination({ folderId: null, virtualFolderId: null })}
                                    disabled={activeFolderId === null && activeVirtualFolderId === null}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                                        activeFolderId === null && activeVirtualFolderId === null
                                            ? 'opacity-50 cursor-not-allowed'
                                            : selectedDestination?.folderId === null && selectedDestination?.virtualFolderId === null
                                            ? 'bg-telegram-primary/20 text-telegram-primary'
                                            : 'text-telegram-text hover:bg-telegram-hover'
                                    }`}
                                    style={{ paddingLeft: '36px' }}
                                >
                                    <Folder className="w-4 h-4" />
                                    <span>Root</span>
                                </button>
                                
                                {(allVirtualFolders.get(null) || []).map(folder => 
                                    renderVirtualFolder(folder, null, 0)
                                )}
                            </div>
                        )}
                    </div>

                    {/* Other Drives */}
                    {folders.map(drive => (
                        <div key={drive.id} className="border-b border-telegram-border/50">
                            <button
                                onClick={() => toggleDrive(drive.id)}
                                className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-telegram-text hover:bg-telegram-hover transition-colors"
                            >
                                {expandedDrives.has(drive.id) ? (
                                    <ChevronDown className="w-4 h-4" />
                                ) : (
                                    <ChevronRight className="w-4 h-4" />
                                )}
                                <HardDrive className="w-4 h-4" />
                                <span>{drive.name}</span>
                            </button>
                            
                            {expandedDrives.has(drive.id) && (
                                <div>
                                    <button
                                        onClick={() => setSelectedDestination({ folderId: drive.id, virtualFolderId: null })}
                                        disabled={activeFolderId === drive.id && activeVirtualFolderId === null}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                                            activeFolderId === drive.id && activeVirtualFolderId === null
                                                ? 'opacity-50 cursor-not-allowed'
                                                : selectedDestination?.folderId === drive.id && selectedDestination?.virtualFolderId === null
                                                ? 'bg-telegram-primary/20 text-telegram-primary'
                                                : 'text-telegram-text hover:bg-telegram-hover'
                                        }`}
                                        style={{ paddingLeft: '36px' }}
                                    >
                                        <Folder className="w-4 h-4" />
                                        <span>Root</span>
                                    </button>
                                    
                                    {(allVirtualFolders.get(drive.id) || []).map(folder => 
                                        renderVirtualFolder(folder, drive.id, 0)
                                    )}
                                </div>
                            )}
                        </div>
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
