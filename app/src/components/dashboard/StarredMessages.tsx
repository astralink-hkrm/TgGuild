import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Star, ArrowLeft, MessageSquare, Trash2 } from 'lucide-react';
import { formatTime } from '../../utils';

interface StarredMessage {
    message_id: number;
    chat_id: number;
    text: string;
    sender_name: string;
    date: string;
    chat_name: string;
}

interface StarredMessagesProps {
    open: boolean;
    onClose: () => void;
    onJumpToMessage: (chatId: number, messageId: number) => boolean;
}

export function StarredMessages({ open, onClose, onJumpToMessage }: StarredMessagesProps) {
    const [messages, setMessages] = useState<StarredMessage[]>([]);
    const [loading, setLoading] = useState(false);

    const loadStarred = () => {
        setLoading(true);
        invoke<StarredMessage[]>('cmd_get_starred_messages')
            .then(setMessages)
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (open) loadStarred();
    }, [open]);

    const handleUnstar = async (msg: StarredMessage) => {
        try {
            await invoke('cmd_unstar_message', {
                chatId: msg.chat_id,
                messageId: msg.message_id,
            });
            loadStarred();
        } catch (e) {
            console.error('Failed to unstar:', e);
        }
    };

    const handleJump = (msg: StarredMessage) => {
        const found = onJumpToMessage(msg.chat_id, msg.message_id);
        if (found) onClose();
    };

    if (!open) return null;

    return (
        <div className="flex-1 flex flex-col bg-telegram-bg overflow-hidden">
            <div className="h-14 px-4 border-b border-telegram-border bg-telegram-surface flex items-center gap-3 flex-shrink-0">
                <button
                    onClick={onClose}
                    className="p-2 text-telegram-text hover:bg-telegram-hover rounded-full transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                    <h2 className="text-[15px] font-semibold text-telegram-text">Starred Messages</h2>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="w-6 h-6 border-2 border-telegram-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Star className="w-12 h-12 text-telegram-subtext/30 mb-3" />
                        <p className="text-sm text-telegram-subtext">No starred messages yet</p>
                        <p className="text-xs text-telegram-subtext/60 mt-1">Star messages to find them quickly later</p>
                    </div>
                ) : (
                    <div className="py-2">
                        {messages.map((msg) => (
                            <div
                                key={`${msg.chat_id}-${msg.message_id}`}
                                className="px-4 py-3 hover:bg-telegram-hover/50 transition-colors cursor-pointer border-b border-telegram-border/50"
                                onClick={() => handleJump(msg)}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <MessageSquare className="w-3.5 h-3.5 text-telegram-subtext shrink-0" />
                                            <span className="text-xs font-medium text-telegram-primary truncate">{msg.chat_name}</span>
                                            <span className="text-xs text-telegram-subtext shrink-0">{formatTime(msg.date)}</span>
                                        </div>
                                        {msg.sender_name && (
                                            <p className="text-xs text-telegram-subtext mt-0.5">{msg.sender_name}</p>
                                        )}
                                        <p className="text-sm text-telegram-text mt-1 line-clamp-2">{msg.text}</p>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleUnstar(msg); }}
                                        className="p-1.5 text-telegram-subtext hover:text-yellow-400 hover:bg-telegram-hover rounded-full shrink-0 transition-colors"
                                        title="Remove star"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
