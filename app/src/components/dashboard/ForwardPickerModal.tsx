import { useState, useEffect } from 'react';
import { X, Send, Search, MessageCircle, Hash, Check } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface ForwardTarget {
    id: number;
    name: string;
    is_channel: boolean;
    is_supergroup: boolean;
}

interface ForwardPickerModalProps {
    open: boolean;
    onClose: () => void;
    onForward: (targetIds: number[], sendCopy: boolean) => void;
}

export function ForwardPickerModal({ open, onClose, onForward }: ForwardPickerModalProps) {
    const [targets, setTargets] = useState<ForwardTarget[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [sendCopy, setSendCopy] = useState(true);

    useEffect(() => {
        if (!open) {
            setSelectedIds(new Set());
            setSearch('');
            return;
        }
        setLoading(true);
        setSearch('');
        setSelectedIds(new Set());
        invoke<ForwardTarget[]>('cmd_get_forward_targets')
            .then(setTargets)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [open]);

    const filtered = targets.filter(t =>
        t.name.toLowerCase().includes(search.toLowerCase())
    );

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleForward = () => {
        if (selectedIds.size === 0) return;
        onForward(Array.from(selectedIds), sendCopy);
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-lg mx-4 bg-telegram-surface/95 backdrop-blur-xl border border-telegram-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-4 py-3 border-b border-telegram-border flex items-center justify-between">
                    <h3 className="text-base font-semibold text-telegram-text">Forward messages</h3>
                    <button onClick={onClose} className="p-1.5 text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="relative px-3 py-2">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-telegram-subtext" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search chats..."
                        className="w-full pl-8 pr-3 py-2 bg-telegram-hover border border-telegram-border rounded-lg text-sm text-telegram-text placeholder:text-telegram-subtext outline-none focus:border-telegram-primary transition-colors"
                        autoFocus
                    />
                </div>

                <div className="max-h-80 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="w-6 h-6 border-2 border-telegram-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <p className="text-center text-sm text-telegram-subtext py-8">No chats found</p>
                    ) : (
                        filtered.map((target) => {
                            const isSelected = selectedIds.has(target.id);
                            return (
                                <button
                                    key={target.id}
                                    onClick={() => toggleSelect(target.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                                        isSelected
                                            ? 'bg-telegram-primary/10 text-telegram-primary'
                                            : 'text-telegram-text hover:bg-telegram-hover'
                                    }`}
                                >
                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                                        target.is_channel
                                            ? 'bg-blue-500/20 text-blue-400'
                                            : 'bg-telegram-primary/20 text-telegram-primary'
                                    }`}>
                                        {target.is_channel ? <Hash className="w-4 h-4" /> : <MessageCircle className="w-4 h-4" />}
                                    </div>
                                    <div className="flex-1 min-w-0 text-left">
                                        <p className="font-medium truncate">{target.name}</p>
                                        <p className="text-xs text-telegram-subtext">
                                            {target.is_channel ? 'Channel' : target.is_supergroup ? 'Group' : 'Direct chat'}
                                        </p>
                                    </div>
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                        isSelected
                                            ? 'bg-telegram-primary border-telegram-primary text-white'
                                            : 'border-telegram-subtext/50'
                                    }`}>
                                        {isSelected && <Check className="w-3.5 h-3.5" />}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                <div className="px-4 py-3 border-t border-telegram-border flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-telegram-subtext cursor-pointer">
                        <input
                            type="checkbox"
                            checked={sendCopy}
                            onChange={(e) => setSendCopy(e.target.checked)}
                            className="rounded border-telegram-border text-telegram-primary focus:ring-telegram-primary"
                        />
                        Send copy
                    </label>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-telegram-subtext">
                            {selectedIds.size > 0 ? `${selectedIds.size} chat${selectedIds.size > 1 ? 's' : ''} selected` : ''}
                        </span>
                        <button
                            onClick={handleForward}
                            disabled={selectedIds.size === 0}
                            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-telegram-primary rounded-lg hover:bg-telegram-primary-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            <Send className="w-3.5 h-3.5" />
                            Forward
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
