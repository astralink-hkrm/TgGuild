import { X, Forward, Trash2, Star, Copy } from 'lucide-react';
import { useState } from 'react';

interface SelectionBarProps {
    selectedCount: number;
    onCancel: () => void;
    onForward: () => void;
    onDelete: () => void;
    onStar: () => void;
    onCopy: () => void;
    canStar: boolean;
}

export function SelectionBar({ selectedCount, onCancel, onForward, onDelete, onStar, onCopy, canStar }: SelectionBarProps) {
    if (selectedCount === 0) return null;

    return (
        <div className="absolute bottom-20 left-4 right-4 z-30 animate-in slide-in-from-bottom-4 fade-in duration-200">
            <div className="bg-telegram-surface/95 backdrop-blur-xl border border-telegram-border rounded-xl shadow-2xl px-3 py-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                    <div className="w-7 h-7 rounded-full bg-telegram-primary/20 flex items-center justify-center">
                        <span className="text-xs font-bold text-telegram-primary">{selectedCount}</span>
                    </div>
                    <span className="text-xs text-telegram-subtext">selected</span>
                </div>

                <div className="flex items-center gap-1">
                    <ActionButton icon={<Forward className="w-4 h-4" />} label="Forward" onClick={onForward} />
                    {canStar && <ActionButton icon={<Star className="w-4 h-4" />} label="Star" onClick={onStar} />}
                    <ActionButton icon={<Copy className="w-4 h-4" />} label="Copy" onClick={onCopy} />
                    <ActionButton icon={<Trash2 className="w-4 h-4 text-red-400" />} label="Delete" onClick={onDelete} />
                </div>

                <button
                    onClick={onCancel}
                    className="p-1.5 text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover rounded-full transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="flex flex-col items-center gap-0.5 px-2 py-1 text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover rounded-lg transition-colors min-w-[48px]"
            title={label}
        >
            {icon}
            <span className="text-[10px] leading-tight">{label}</span>
        </button>
    );
}

export function SelectionDeleteConfirm({ open, count, onConfirm, onCancel }: {
    open: boolean;
    count: number;
    onConfirm: (revoke: boolean) => void;
    onCancel: () => void;
}) {
    const [revoke, setRevoke] = useState(true);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
            <div
                className="w-full max-w-sm mx-4 bg-telegram-surface/95 backdrop-blur-xl border border-telegram-border rounded-2xl shadow-2xl p-5 animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-base font-semibold text-telegram-text">Delete {count} message{count > 1 ? 's' : ''}?</h3>
                <p className="text-sm text-telegram-subtext mt-2">This action cannot be undone.</p>
                <label className="flex items-center gap-2 mt-3 text-sm text-telegram-text cursor-pointer">
                    <input
                        type="checkbox"
                        checked={revoke}
                        onChange={(e) => setRevoke(e.target.checked)}
                        className="rounded border-telegram-border text-telegram-primary focus:ring-telegram-primary"
                    />
                    Delete for everyone
                </label>
                <div className="flex items-center justify-end gap-2 mt-4">
                    <button
                        onClick={onCancel}
                        className="px-4 py-1.5 text-sm text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => onConfirm(revoke)}
                        className="px-4 py-1.5 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}
