import { useState, useMemo } from 'react';
import { X, FileText, Image as ImageIcon, Film, Music, Paperclip, Download } from 'lucide-react';

interface ChatMessage {
    id: number;
    sender_id: number;
    sender_name: string;
    sender_photo_url?: string | null;
    text: string;
    date: string;
    has_media: boolean;
    media_type: string;
    media_name: string;
    media_size: number;
    mime_type: string;
    outgoing?: boolean;
    pinned?: boolean;
    pending?: boolean;
    audio_duration?: number | null;
}

export type SharedMediaTab = 'all' | 'media';

interface SharedMediaModalProps {
    messages: ChatMessage[];
    groupName: string;
    onClose: () => void;
    onDownload: (msg: ChatMessage) => void;
    formatFileSize: (bytes: number) => string;
    formatTime: (dateStr: string) => string;
    initialTab?: SharedMediaTab;
}

function getMediaIcon(type: string) {
    switch (type) {
        case 'photo': case 'image': return <ImageIcon className="w-5 h-5" />;
        case 'video': return <Film className="w-5 h-5" />;
        case 'voice': case 'audio': return <Music className="w-5 h-5" />;
        case 'document': return <FileText className="w-5 h-5" />;
        default: return <Paperclip className="w-5 h-5" />;
    }
}

export function SharedMediaModal({ messages, groupName, onClose, onDownload, formatFileSize, formatTime, initialTab = 'all' }: SharedMediaModalProps) {
    const [tab, setTab] = useState<SharedMediaTab>(initialTab);

    const filtered = useMemo(() => {
        return messages.filter(msg => msg.has_media && msg.media_type !== 'none' && !msg.pending);
    }, [messages]);

    const mediaItems = useMemo(() => {
        return filtered.filter(msg => ['photo', 'image', 'video', 'voice', 'audio'].includes(msg.media_type));
    }, [filtered]);

    const items = tab === 'media' ? mediaItems : filtered;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-telegram-border bg-telegram-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-telegram-border p-4">
                    <div>
                        <h3 className="text-base font-semibold text-telegram-text">Shared Content</h3>
                        <p className="text-xs text-telegram-subtext">{groupName}</p>
                    </div>
                    <button onClick={onClose} className="rounded-full p-2 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex gap-1 border-b border-telegram-border px-4 pt-2">
                    <button
                        onClick={() => setTab('all')}
                        className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${tab === 'all' ? 'bg-telegram-hover/50 text-telegram-text border-b-2 border-telegram-primary' : 'text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover/30'}`}
                    >
                        All Files ({filtered.length})
                    </button>
                    <button
                        onClick={() => setTab('media')}
                        className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${tab === 'media' ? 'bg-telegram-hover/50 text-telegram-text border-b-2 border-telegram-primary' : 'text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover/30'}`}
                    >
                        Media ({mediaItems.length})
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {items.length === 0 ? (
                        <div className="flex h-full items-center justify-center text-sm text-telegram-subtext">
                            No shared {tab === 'media' ? 'media' : 'files'} yet
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {items.map((msg) => (
                                <div
                                    key={msg.id}
                                    className="flex items-center gap-3 rounded-xl bg-telegram-hover/30 p-3 hover:bg-telegram-hover/50 transition-colors group"
                                >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-telegram-hover text-telegram-subtext">
                                        {getMediaIcon(msg.media_type)}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-telegram-text">
                                            {msg.media_name || msg.media_type}
                                        </p>
                                        <p className="text-xs text-telegram-subtext">
                                            {msg.sender_name} · {formatTime(msg.date)}
                                            {msg.media_size > 0 ? ` · ${formatFileSize(msg.media_size)}` : ''}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => onDownload(msg)}
                                        className="shrink-0 rounded-lg p-2 text-telegram-subtext opacity-0 group-hover:opacity-100 hover:bg-telegram-hover hover:text-telegram-text transition-all"
                                        title="Download"
                                    >
                                        <Download className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
