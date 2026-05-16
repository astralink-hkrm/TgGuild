import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

interface RenameModalProps {
    currentName: string;
    onClose: () => void;
    onRename: (newName: string) => void;
    type: 'file' | 'folder';
}

export function RenameModal({ currentName, onClose, onRename, type }: RenameModalProps) {
    const [newName, setNewName] = useState(currentName);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, []);

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (newName.trim() && newName !== currentName) {
            onRename(newName.trim());
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="w-full max-w-md bg-telegram-surface border border-telegram-border rounded-2xl shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                <div className="px-6 py-4 flex items-center justify-between border-b border-telegram-border">
                    <h3 className="text-lg font-bold text-telegram-text">Rename {type === 'file' ? 'File' : 'Folder'}</h3>
                    <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-full transition-colors">
                        <X className="w-5 h-5 text-telegram-subtext" />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6">
                    <div className="mb-4">
                        <label className="block text-xs font-semibold text-telegram-subtext uppercase tracking-wider mb-2">New Name</label>
                        <input
                            ref={inputRef}
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => e.key === 'Escape' && onClose()}
                            className="w-full bg-white/5 border border-telegram-border focus:border-telegram-primary rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-telegram-primary/50 transition-all"
                            placeholder={`Enter ${type} name`}
                        />
                    </div>
                    
                    <div className="flex gap-3 mt-8">
                        <button 
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold text-telegram-text bg-white/5 hover:bg-white/10 rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            disabled={!newName.trim() || newName === currentName}
                            className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-telegram-primary hover:bg-telegram-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-lg shadow-telegram-primary/20 transition-all"
                        >
                            Save Changes
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
}
