import { useState, useRef, useEffect } from 'react';
import { Plus, Folder, Loader2 } from 'lucide-react';

interface CreateFolderModalProps {
    onClose: () => void;
    onCreate: (name: string) => Promise<void>;
}

export function CreateFolderModal({ onClose, onCreate }: CreateFolderModalProps) {
    const [folderName, setFolderName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Auto-focus the input when modal opens
        inputRef.current?.focus();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!folderName.trim()) return;

        setIsCreating(true);
        try {
            await onCreate(folderName.trim());
            onClose();
        } catch (error) {
            // Error handling is done in the parent component
            setIsCreating(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };

    return (
        <div 
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" 
            onClick={onClose}
        >
            <div 
                className="bg-telegram-surface border border-telegram-border rounded-xl w-96 shadow-2xl overflow-hidden flex flex-col" 
                onClick={e => e.stopPropagation()}
            >
                <div className="p-4 border-b border-telegram-border flex justify-between items-center">
                    <h3 className="text-telegram-text font-medium">Create New Folder</h3>
                    <button 
                        onClick={onClose} 
                        className="text-telegram-subtext hover:text-telegram-text transition-colors"
                        disabled={isCreating}
                    >
                        <Plus className="w-5 h-5 rotate-45" />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="p-4">
                        <label className="block text-xs font-medium text-telegram-subtext mb-2">
                            Folder name:
                        </label>
                        
                        <div className="relative">
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-telegram-subtext">
                                <Folder className="w-4 h-4" />
                            </div>
                            <input
                                ref={inputRef}
                                type="text"
                                value={folderName}
                                onChange={(e) => setFolderName(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Enter folder name"
                                disabled={isCreating}
                                className="w-full pl-10 pr-4 py-3 bg-telegram-hover border border-telegram-border rounded-xl text-telegram-text placeholder:text-telegram-subtext focus:outline-none focus:ring-2 focus:ring-telegram-primary/50 focus:border-telegram-primary transition-all disabled:opacity-50"
                                maxLength={100}
                            />
                        </div>
                        
                        {folderName.trim() && (
                            <p className="mt-2 text-xs text-telegram-subtext">
                                {folderName.trim().length} / 100 characters
                            </p>
                        )}
                    </div>

                    <div className="p-4 border-t border-telegram-border flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isCreating}
                            className="px-4 py-2 text-sm font-medium text-telegram-subtext hover:text-telegram-text transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isCreating || !folderName.trim()}
                            className="flex items-center gap-2 px-4 py-2 bg-telegram-primary text-white text-sm font-medium rounded-lg hover:bg-telegram-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isCreating ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <Folder className="w-4 h-4" />
                                    Create Folder
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
