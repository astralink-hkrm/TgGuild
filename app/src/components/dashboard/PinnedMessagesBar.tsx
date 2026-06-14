import { Pin, X } from 'lucide-react';

interface PinnedMessage {
    message_id: number;
    text: string;
    sender_name: string;
    date: string;
}

interface PinnedMessagesBarProps {
    pinnedMessages: PinnedMessage[];
    onJumpToMessage: (messageId: number) => void;
    onUnpin: (messageId: number) => void;
    onShowAll: () => void;
    canUnpin: boolean;
}

export function PinnedMessagesBar({ pinnedMessages, onJumpToMessage, onUnpin, onShowAll, canUnpin }: PinnedMessagesBarProps) {
    if (pinnedMessages.length === 0) return null;
    const latest = pinnedMessages[pinnedMessages.length - 1];
    const overflow = pinnedMessages.length - 1;

    return (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-telegram-surface/80 border-b border-telegram-border text-sm cursor-pointer hover:bg-telegram-hover/50 transition-colors group"
            onClick={() => { if (pinnedMessages.length === 1) onJumpToMessage(latest.message_id); else onShowAll(); }}
        >
            <Pin className="w-4 h-4 text-telegram-primary shrink-0 rotate-45" />
            <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-telegram-primary">Pinned message</span>
                {overflow > 0 ? (
                    <p className="text-xs text-telegram-subtext truncate">{overflow + 1} pinned messages</p>
                ) : (
                    <p className="text-xs text-telegram-subtext truncate">
                        {latest.sender_name}: {latest.text}
                    </p>
                )}
            </div>
            {canUnpin && (
                <button
                    onClick={(e) => { e.stopPropagation(); onUnpin(latest.message_id); }}
                    className="p-1 text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover rounded-full opacity-0 group-hover:opacity-100 transition-all"
                    title="Unpin"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
}
