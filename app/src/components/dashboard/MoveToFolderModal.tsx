import { useState } from 'react';
import { Plus, HardDrive, Folder, ChevronDown, Loader2 } from 'lucide-react';
import { TelegramFolder } from '../../types';

interface MoveToFolderModalProps {
    folders: TelegramFolder[];
    onClose: () => void;
    onSelect: (id: number | null) => void;
    activeFolderId: number | null;
}

interface FolderItem {
    id: number | null;
    name: string;
    isRoot?: boolean;
}

export function MoveToFolderModal({ folders, onClose, onSelect, activeFolderId }: MoveToFolderModalProps) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedFolder, setSelectedFolder] = useState<FolderItem | null>(null);
    const [isMoving, setIsMoving] = useState(false);

    const availableFolders: FolderItem[] = [
        ...(activeFolderId !== null ? [{ id: null, name: 'Saved Messages', isRoot: true }] : []),
        ...folders.filter(f => f.id !== activeFolderId).map(f => ({ id: f.id, name: f.name }))
    ];

    const handleSelectAndMove = async (folder: FolderItem) => {
        setIsMoving(true);
        try {
            await onSelect(folder.id);
            onClose();
        } finally {
            setIsMoving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-telegram-surface border border-telegram-border rounded-xl w-96 shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-telegram-border flex justify-between items-center">
                    <h3 className="text-telegram-text font-medium">Move to Folder</h3>
                    <button onClick={onClose} className="text-telegram-subtext hover:text-telegram-text">
                        <Plus className="w-5 h-5 rotate-45" />
                    </button>
                </div>

                <div className="p-4">
                    <label className="block text-xs font-medium text-telegram-subtext mb-2">
                        Select destination
                    </label>
                    
                    <div className="relative">
                        <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            disabled={availableFolders.length === 0}
                            className="w-full flex items-center justify-between px-4 py-3 bg-telegram-hover border border-telegram-border rounded-xl text-telegram-text hover:bg-telegram-border/50 transition-colors disabled:opacity-50"
                        >
                            <div className="flex items-center gap-3">
                                {selectedFolder ? (
                                    <>
                                        <div className="w-8 h-8 rounded bg-telegram-hover flex items-center justify-center text-telegram-text">
                                            <Folder className="w-4 h-4" />
                                        </div>
                                        <span className="font-medium">{selectedFolder.name}</span>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-8 h-8 rounded bg-telegram-primary/20 flex items-center justify-center text-telegram-primary">
                                            <HardDrive className="w-4 h-4" />
                                        </div>
                                        <span className="font-medium text-telegram-subtext">
                                            {activeFolderId !== null ? 'Saved Messages' : 'Select a folder'}
                                        </span>
                                    </>
                                )}
                            </div>
                            <ChevronDown className={`w-4 h-4 text-telegram-subtext transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isDropdownOpen && availableFolders.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-telegram-surface border border-telegram-border rounded-xl shadow-xl z-10 max-h-60 overflow-y-auto">
                                {availableFolders.map((folder) => (
                                    <button
                                        key={folder.id ?? 'root'}
                                        onClick={() => {
                                            setSelectedFolder(folder);
                                            setIsDropdownOpen(false);
                                        }}
                                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-left text-telegram-text hover:bg-telegram-hover transition-colors border-b border-telegram-border/50 last:border-b-0"
                                    >
                                        <div className={`w-8 h-8 rounded flex items-center justify-center ${folder.isRoot ? 'bg-telegram-primary/20 text-telegram-primary' : 'bg-telegram-hover text-telegram-text'}`}>
                                            {folder.isRoot ? (
                                                <HardDrive className="w-4 h-4" />
                                            ) : (
                                                <Folder className="w-4 h-4" />
                                            )}
                                        </div>
                                        <span className="font-medium">{folder.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {availableFolders.length === 0 && (
                        <p className="mt-3 text-xs text-telegram-subtext text-center">
                            No other folders available. Create one first!
                        </p>
                    )}
                </div>

                <div className="p-4 border-t border-telegram-border flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-telegram-subtext hover:text-telegram-text transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            const folderToMove = selectedFolder || (activeFolderId !== null ? { id: null, name: 'Saved Messages' } : availableFolders[0]);
                            if (folderToMove) {
                                handleSelectAndMove(folderToMove);
                            }
                        }}
                        disabled={isMoving || availableFolders.length === 0}
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
