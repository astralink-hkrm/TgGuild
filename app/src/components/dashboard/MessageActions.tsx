import { MessageSquare, Copy, Edit3, Trash2, Info, SmilePlus, Pin, Star, Forward as ForwardIcon, CheckSquare, Square } from 'lucide-react';

interface MessageActionsProps {
    isOutgoing: boolean;
    canEdit: boolean;
    onReply: () => void;
    onCopy: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onInfo: () => void;
    onReact?: () => void;
    onPin?: () => void;
    isPinned?: boolean;
    onStar?: () => void;
    isStarred?: boolean;
    onForward?: () => void;
    isSelected?: boolean;
    onToggleSelect?: () => void;
}

export function MessageActions({ isOutgoing, canEdit, onReply, onCopy, onEdit, onDelete, onInfo, onReact, onPin, isPinned, onStar, isStarred, onForward, isSelected, onToggleSelect }: MessageActionsProps) {
    return (
        <div
            className={`absolute -top-8 flex items-center gap-0.5 rounded-lg border border-telegram-border bg-telegram-surface px-1 py-1 shadow-lg opacity-0 transition-opacity group-hover:opacity-100 z-20 ${isOutgoing ? 'right-0' : 'left-0'}`}
        >
            {onToggleSelect && (
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
                    className="rounded p-1 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors"
                    title="Select"
                >
                    {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-telegram-primary" /> : <Square className="w-3.5 h-3.5" />}
                </button>
            )}
            <button
                onClick={(e) => { e.stopPropagation(); onReply(); }}
                className="rounded p-1 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors"
                title="Reply"
            >
                <MessageSquare className="w-3.5 h-3.5" />
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); onReact?.(); }}
                className="rounded p-1 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors"
                title="React"
            >
                <SmilePlus className="w-3.5 h-3.5" />
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); onCopy(); }}
                className="rounded p-1 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors"
                title="Copy"
            >
                <Copy className="w-3.5 h-3.5" />
            </button>
            {canEdit && (
                <button
                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                    className="rounded p-1 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors"
                    title="Edit"
                >
                    <Edit3 className="w-3.5 h-3.5" />
                </button>
            )}
            {onPin && (
                <button
                    onClick={(e) => { e.stopPropagation(); onPin(); }}
                    className={`rounded p-1 transition-colors ${isPinned ? 'text-telegram-primary hover:bg-telegram-hover' : 'text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text'}`}
                    title={isPinned ? 'Unpin' : 'Pin'}
                >
                    <Pin className={`w-3.5 h-3.5 ${isPinned ? 'rotate-45' : ''}`} />
                </button>
            )}
            {onStar && (
                <button
                    onClick={(e) => { e.stopPropagation(); onStar(); }}
                    className={`rounded p-1 transition-colors ${isStarred ? 'text-yellow-400' : 'text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text'}`}
                    title={isStarred ? 'Unstar' : 'Star'}
                >
                    <Star className={`w-3.5 h-3.5 ${isStarred ? 'fill-yellow-400' : ''}`} />
                </button>
            )}
            {onForward && (
                <button
                    onClick={(e) => { e.stopPropagation(); onForward(); }}
                    className="rounded p-1 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors"
                    title="Forward"
                >
                    <ForwardIcon className="w-3.5 h-3.5" />
                </button>
            )}
            <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="rounded p-1 text-telegram-subtext hover:bg-red-500/20 hover:text-red-400 transition-colors"
                title="Delete"
            >
                <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); onInfo(); }}
                className="rounded p-1 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors"
                title="Info"
            >
                <Info className="w-3.5 h-3.5" />
            </button>
        </div>
    );
}
