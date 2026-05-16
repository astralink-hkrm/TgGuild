import { useState, useEffect, useRef } from 'react';
import { tempDir, join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import {
    AtSign,
    Download,
    X,
    File,
    FileText,
    Film,
    Image as ImageIcon,
    Mic,
    MoreVertical,
    Music,
    Paperclip,
    Pin,
    Search,
    Send,
    Smile,
    UserPlus,
    Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { TelegramAvatar } from './TelegramAvatar';

interface ChatMessage {
    id: number;
    sender_id: number;
    sender_name: string;
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
}

interface AttachmentDraft {
    path: string;
    name: string;
    mediaType: string;
}

interface MentionableMember {
    user_id: string | number;
    first_name: string;
    last_name?: string | null;
    username?: string | null;
}

interface StreamInfo {
    token: string;
    base_url: string;
}

interface TeamChatProps {
    groupId: number | null;
    groupName: string;
    memberCount?: number;
    canManageMembers?: boolean;
    isDirect?: boolean;
    mentionableMembers?: MentionableMember[];
    onManageMembers?: () => void;
}

export function TeamChat({
    groupId,
    groupName,
    memberCount,
    canManageMembers = false,
    isDirect = false,
    mentionableMembers = [],
    onManageMembers,
}: TeamChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [recording, setRecording] = useState(false);
    const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
    const [recordingSeconds, setRecordingSeconds] = useState(0);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [attachmentDraft, setAttachmentDraft] = useState<AttachmentDraft | null>(null);
    const [reactionPickerFor, setReactionPickerFor] = useState<number | null>(null);
    const [reactions, setReactions] = useState<Record<string, string[]>>({});
    const [downloadingId, setDownloadingId] = useState<number | null>(null);
    const [streamToken, setStreamToken] = useState('');
    const [streamBaseUrl, setStreamBaseUrl] = useState('http://localhost:14201');
    const recorderRef = useRef<MediaRecorder | null>(null);
    const recordingChunksRef = useRef<BlobPart[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadMessages();
        const timer = window.setInterval(() => loadMessages(true), 5000);
        return () => window.clearInterval(timer);
    }, [groupId]);

    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(`tgTeams.reactions.${groupId ?? 'self'}`);
            setReactions(raw ? JSON.parse(raw) : {});
        } catch {
            setReactions({});
        }
    }, [groupId]);

    useEffect(() => {
        invoke<StreamInfo>('cmd_get_stream_info')
            .then((info) => {
                setStreamToken(info.token);
                setStreamBaseUrl(info.base_url);
            })
            .catch(console.error);
    }, []);

    useEffect(() => {
        if (!recording || !recordingStartedAt) return;
        const timer = window.setInterval(() => {
            setRecordingSeconds(Math.max(1, Math.floor((Date.now() - recordingStartedAt) / 1000)));
        }, 500);
        return () => window.clearInterval(timer);
    }, [recording, recordingStartedAt]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const loadMessages = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            setError(null);
            const result = await invoke<ChatMessage[]>('cmd_get_team_messages', { teamId: groupId, limit: 1000 });
            setMessages((current) => {
                const pending = current.filter(message => message.pending);
                return [...result.slice().reverse(), ...pending];
            });
        } catch (e) {
            setError(String(e));
            if (!silent) toast.error(`Failed to load messages: ${e}`);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const handleSend = async () => {
        if ((!newMessage.trim() && !attachmentDraft) || sending || uploading) return;
        try {
            setSending(true);
            if (attachmentDraft) {
                setUploading(true);
                addPendingAttachment(attachmentDraft.path, attachmentDraft.name, newMessage.trim());
                await invoke('cmd_send_team_file', {
                    teamId: groupId,
                    path: attachmentDraft.path,
                    caption: newMessage.trim() || null,
                });
                setAttachmentDraft(null);
            } else {
                await invoke('cmd_send_team_message', { teamId: groupId, message: newMessage });
            }
            setNewMessage('');
            loadMessages(true);
        } catch (e) {
            toast.error(`Failed to send: ${e}`);
        } finally {
            setSending(false);
            setUploading(false);
        }
    };

    const handleAttach = async () => {
        if (uploading) return;
        try {
            const selected = await open({
                multiple: false,
                directory: false,
            });
            if (!selected || Array.isArray(selected)) return;
            const name = getFileName(selected);
            setAttachmentDraft({
                path: selected,
                name,
                mediaType: getMediaTypeFromName(name),
            });
        } catch (e) {
            toast.error(`Failed to select file: ${e}`);
        }
    };

    const handleMention = () => {
        setNewMessage((value) => `${value}${value && !value.endsWith(' ') ? ' ' : ''}@`);
        requestAnimationFrame(() => inputRef.current?.focus());
    };

    const handleMentionSelect = (value: string) => {
        setNewMessage((message) => {
            const match = message.match(/(^|\s)@[\w]*$/);
            if (!match || match.index === undefined) {
                return `${message}${message && !message.endsWith(' ') ? ' ' : ''}${value} `;
            }
            const start = match.index + match[1].length;
            return `${message.slice(0, start)}${value} `;
        });
        requestAnimationFrame(() => inputRef.current?.focus());
    };

    const handlePin = async (messageId: number) => {
        try {
            await invoke('cmd_pin_team_message', { teamId: groupId, messageId });
            toast.success('Message pinned');
            loadMessages(true);
        } catch (e) {
            toast.error(`Failed to pin message: ${e}`);
        }
    };

    const handleVoice = async () => {
        if (recording) {
            recorderRef.current?.stop();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            recordingChunksRef.current = [];
            recorderRef.current = recorder;

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) recordingChunksRef.current.push(event.data);
            };

            recorder.onstop = async () => {
                try {
                    setRecording(false);
                    setRecordingStartedAt(null);
                    setRecordingSeconds(0);
                    stream.getTracks().forEach(track => track.stop());

                    const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
                    const bytes = new Uint8Array(await blob.arrayBuffer());
                    const dir = await tempDir();
                    const filePath = await join(dir, `voice-${Date.now()}.webm`);
                    await writeFile(filePath, bytes);
                    addPendingAttachment(filePath, 'Voice message');
                    await invoke('cmd_upload_file', {
                        path: filePath,
                        folderId: groupId,
                        virtualFolderId: null,
                        transferId: `voice-${groupId ?? 'self'}-${Date.now()}`,
                    });
                    toast.success('Voice message sent');
                    loadMessages(true);
                } catch (e) {
                    toast.error(`Failed to send voice message: ${e}`);
                } finally {
                    recorderRef.current = null;
                    recordingChunksRef.current = [];
                }
            };

            recorder.start();
            setRecording(true);
            setRecordingStartedAt(Date.now());
            setRecordingSeconds(0);
        } catch (e) {
            toast.error(`Microphone is not available: ${e}`);
        }
    };

    const handleDownload = async (msg: ChatMessage) => {
        if (!msg.has_media || downloadingId === msg.id) return;
        try {
            setDownloadingId(msg.id);
            const fileName = msg.media_name || `media_${msg.id}`;
            const savePath = await save({
                defaultPath: fileName,
                filters: [{ name: 'All Files', extensions: ['*'] }],
            });

            if (savePath) {
                await invoke('cmd_download_team_media', {
                    messageId: msg.id,
                    teamId: groupId,
                    savePath,
                });
                toast.success('Downloaded successfully');
            }
        } catch (e) {
            toast.error(`Download failed: ${e}`);
        } finally {
            setDownloadingId(null);
        }
    };

    const formatTime = (dateStr: string) => {
        const parsed = new Date(dateStr.replace(' ', 'T'));
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        return dateStr.split(' ')[1]?.slice(0, 5) || dateStr;
    };

    const formatFileSize = (bytes: number) => {
        if (!bytes) return '';
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    };

    const getFileName = (path: string) => path.split(/[\\/]/).pop() || 'Attachment';

    const getMediaTypeFromName = (name: string) => {
        const ext = name.split('.').pop()?.toLowerCase() || '';
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
        if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return 'video';
        if (['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'webm'].includes(ext)) return 'audio';
        if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'].includes(ext)) return 'document';
        return 'file';
    };

    const addPendingAttachment = (path: string, displayName?: string, caption?: string) => {
        const fileName = displayName || getFileName(path);
        setMessages((current) => ([
            ...current,
            {
                id: -Date.now(),
                sender_id: 0,
                sender_name: 'You',
                text: caption || '',
                date: new Date().toISOString().slice(0, 19).replace('T', ' '),
                has_media: true,
                media_type: getMediaTypeFromName(fileName),
                media_name: fileName,
                media_size: 0,
                mime_type: '',
                outgoing: true,
                pending: true,
            },
        ]));
    };

    const mediaStreamUrl = (msg: ChatMessage) => {
        if (msg.pending) return null;
        const peerKey = groupId === null ? 'home' : String(groupId);
        return `${streamBaseUrl}/stream/${peerKey}/${msg.id}?token=${streamToken}`;
    };

    const mentionQuery = newMessage.match(/(?:^|\s)@([\w]*)$/)?.[1].toLowerCase();
    const mentionOptions = mentionQuery === undefined ? [] : [
        { label: '@all', description: 'Mention everyone' },
        ...mentionableMembers
            .filter(member => {
                const text = `${member.first_name} ${member.last_name || ''} ${member.username || ''}`.toLowerCase();
                return text.includes(mentionQuery);
            })
            .slice(0, 8)
            .map(member => ({
                label: member.username ? `@${member.username}` : `@${member.first_name.replace(/\s+/g, '')}`,
                description: `${member.first_name} ${member.last_name || ''}`.trim(),
            })),
    ];

    const emojis = ['😀', '😂', '😍', '🔥', '👍', '🙏', '🎉', '❤️', '😎', '😮', '😢', '👏', '✅', '💡', '🚀', '📌', '📎', '☕'];
    const reactionEmojis = ['👍', '❤️', '😂', '🔥', '👏', '🎉'];

    const saveReaction = (messageId: number, emoji: string) => {
        const key = String(messageId);
        const next = {
            ...reactions,
            [key]: reactions[key]?.includes(emoji)
                ? reactions[key].filter(item => item !== emoji)
                : [...(reactions[key] || []), emoji],
        };
        setReactions(next);
        window.localStorage.setItem(`tgTeams.reactions.${groupId ?? 'self'}`, JSON.stringify(next));
        setReactionPickerFor(null);
    };

    const getMediaIcon = (type: string) => {
        switch (type) {
            case 'photo':
            case 'image':
                return <ImageIcon className="w-5 h-5" />;
            case 'video':
                return <Film className="w-5 h-5" />;
            case 'audio':
                return <Music className="w-5 h-5" />;
            case 'document':
                return <FileText className="w-5 h-5" />;
            default:
                return <Paperclip className="w-5 h-5" />;
        }
    };

    return (
        <div className="flex-1 flex flex-col bg-[#050505] overflow-hidden">
            <div className="h-14 px-4 border-b border-[#1f1f1f] bg-[#0f0f0f] flex items-center justify-between flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-[#242424] text-white flex items-center justify-center overflow-hidden">
                        <TelegramAvatar
                            user={{ user_id: groupId ?? 'self', first_name: groupName }}
                            token={streamToken}
                            baseUrl={streamBaseUrl}
                            size="lg"
                            className="border-0"
                        />
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-[15px] font-semibold text-white truncate">{groupName}</h2>
                        <p className="text-xs text-[#8a8a8a] truncate">
                            {isDirect ? 'direct chat' : `${memberCount ?? 0} members`}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1">
                    <button className="p-2 text-[#8a8a8a] hover:text-white hover:bg-white/5 rounded-full transition-colors" title="Search">
                        <Search className="w-5 h-5" />
                    </button>
                    <button className="p-2 text-[#8a8a8a] hover:text-white hover:bg-white/5 rounded-full transition-colors" title="Start meeting">
                        <Video className="w-5 h-5" />
                    </button>
                    {canManageMembers && !isDirect && (
                        <button
                            onClick={onManageMembers}
                            className="p-2 text-[#8a8a8a] hover:text-white hover:bg-white/5 rounded-full transition-colors"
                            title="Manage members"
                        >
                            <UserPlus className="w-5 h-5" />
                        </button>
                    )}
                    <button className="p-2 text-[#8a8a8a] hover:text-white hover:bg-white/5 rounded-full transition-colors" title="More">
                        <MoreVertical className="w-5 h-5" />
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-5 custom-scrollbar">
                {loading ? (
                    <div className="h-full flex items-center justify-center text-sm text-telegram-subtext">Loading messages...</div>
                ) : error && messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-sm text-telegram-subtext">
                        <p className="text-red-400">Error loading messages</p>
                        <p className="mt-2 max-w-md text-center text-xs">{error}</p>
                        <button onClick={() => loadMessages()} className="mt-4 px-4 py-2 bg-telegram-primary text-white rounded-lg">
                            Retry
                        </button>
                    </div>
                ) : messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-telegram-subtext">
                        No messages yet
                    </div>
                ) : (
                    <div className="space-y-2">
                        {messages.map((msg) => {
                            const outgoing = Boolean(msg.outgoing);
                            return (
                                <div key={msg.id} className={`group flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`flex gap-2 max-w-[78%] ${outgoing ? 'flex-row-reverse' : ''}`}>
                                        {!outgoing && !isDirect && (
                                            <TelegramAvatar
                                                user={{ user_id: msg.sender_id, first_name: msg.sender_name }}
                                                token={streamToken}
                                                baseUrl={streamBaseUrl}
                                                size="md"
                                                className="mt-1"
                                            />
                                        )}
                                        <div
                                            className={`rounded-[18px] px-3 py-2 shadow-sm ${
                                                outgoing
                                                    ? 'rounded-br-md bg-[#262626] text-white border border-[#343434]'
                                                    : 'rounded-bl-md bg-[#141414] text-[#f5f5f5] border border-[#242424]'
                                            }`}
                                        >
                                            {!outgoing && !isDirect && (
                                                <p className="mb-1 text-xs font-semibold text-telegram-primary">{msg.sender_name}</p>
                                            )}
                                            {msg.has_media && msg.media_type !== 'none' && (
                                                <div className="mb-2 overflow-hidden rounded-xl">
                                                    {['photo', 'image'].includes(msg.media_type) && mediaStreamUrl(msg) ? (
                                                        <button onClick={() => handleDownload(msg)} className="block max-w-80 overflow-hidden rounded-xl bg-black/20">
                                                            <img src={mediaStreamUrl(msg) || ''} alt="" className="max-h-80 w-full object-cover" />
                                                        </button>
                                                    ) : null}
                                                    <button
                                                        onClick={() => handleDownload(msg)}
                                                        disabled={downloadingId === msg.id || msg.pending}
                                                        className={`mt-1 flex w-full min-w-56 items-center gap-3 rounded-xl p-3 text-left transition-colors ${
                                                            outgoing ? 'bg-white/10 hover:bg-white/15' : 'bg-[#202020] hover:bg-[#292929]'
                                                        } disabled:opacity-60`}
                                                    >
                                                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#333333] text-white">
                                                            {downloadingId === msg.id || msg.pending ? <File className="w-5 h-5 animate-pulse" /> : getMediaIcon(msg.media_type)}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-sm font-medium">{msg.media_name || msg.media_type}</span>
                                                            <span className="text-xs opacity-75">{msg.pending ? 'Sending...' : msg.media_size > 0 ? formatFileSize(msg.media_size) : 'Attachment'}</span>
                                                        </span>
                                                        {!msg.pending && <Download className="w-4 h-4 opacity-75" />}
                                                    </button>
                                                </div>
                                            )}
                                            {msg.text && (
                                                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{msg.text}</p>
                                            )}
                                            <div className={`mt-1 flex items-center justify-end gap-2 text-[10px] ${outgoing ? 'text-white/70' : 'text-[#8a8a8a]'}`}>
                                                {msg.pinned && <Pin className="h-3 w-3" />}
                                                <button
                                                    onClick={() => handlePin(msg.id)}
                                                    className="opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100"
                                                    title="Pin message"
                                                >
                                                    <Pin className="h-3 w-3" />
                                                </button>
                                                <span>{formatTime(msg.date)}</span>
                                            </div>
                                            {(reactions[String(msg.id)]?.length || reactionPickerFor === msg.id) && (
                                                <div className="relative mt-1 flex flex-wrap justify-end gap-1">
                                                    {reactions[String(msg.id)]?.map(emoji => (
                                                        <button
                                                            key={emoji}
                                                            onClick={() => saveReaction(msg.id, emoji)}
                                                            className="rounded-full bg-black/20 px-2 py-0.5 text-xs"
                                                        >
                                                            {emoji}
                                                        </button>
                                                    ))}
                                                    {reactionPickerFor === msg.id && (
                                                        <div className="absolute bottom-7 right-0 flex rounded-full border border-[#242424] bg-[#0f0f0f] p-1 shadow-2xl">
                                                            {reactionEmojis.map(emoji => (
                                                                <button
                                                                    key={emoji}
                                                                    onClick={() => saveReaction(msg.id, emoji)}
                                                                    className="rounded-full p-1.5 text-lg hover:bg-white/10"
                                                                >
                                                                    {emoji}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <button
                                                onClick={() => setReactionPickerFor(reactionPickerFor === msg.id ? null : msg.id)}
                                                className="mt-1 text-[10px] text-[#8a8a8a] opacity-0 transition-opacity group-hover:opacity-100"
                                            >
                                                React
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="relative border-t border-[#1f1f1f] bg-[#0f0f0f] p-3 flex-shrink-0">
                {attachmentDraft && (
                    <div className="mb-2 flex items-center gap-3 rounded-xl border border-[#242424] bg-[#151515] p-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#333333] text-white">
                            {getMediaIcon(attachmentDraft.mediaType)}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-white">{attachmentDraft.name}</p>
                            <p className="text-xs text-[#8a8a8a]">Add a caption, then send</p>
                        </div>
                        <button
                            onClick={() => setAttachmentDraft(null)}
                            className="rounded-full p-2 text-[#8a8a8a] hover:bg-white/5 hover:text-white"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}
                {mentionOptions.length > 0 && (
                    <div className="absolute bottom-[74px] left-14 w-72 overflow-hidden rounded-xl border border-[#242424] bg-[#0f0f0f] shadow-2xl">
                        {mentionOptions.map(option => (
                            <button
                                key={option.label}
                                onClick={() => handleMentionSelect(option.label)}
                                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5"
                            >
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2a2a2a] text-xs font-semibold text-white">
                                    {option.label === '@all' ? 'ALL' : option.description.charAt(0).toUpperCase()}
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate text-sm text-white">{option.label}</span>
                                    <span className="block truncate text-xs text-[#8a8a8a]">{option.description}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                )}
                {showEmojiPicker && (
                    <div className="absolute bottom-[74px] right-14 grid w-64 grid-cols-6 gap-1 rounded-xl border border-[#242424] bg-[#0f0f0f] p-2 shadow-2xl">
                        {emojis.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => {
                                    setNewMessage(value => `${value}${emoji}`);
                                    setShowEmojiPicker(false);
                                    requestAnimationFrame(() => inputRef.current?.focus());
                                }}
                                className="rounded-lg p-2 text-xl hover:bg-white/5"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}
                {recording ? (
                    <div className="flex items-center gap-3 rounded-[22px] border border-red-500/40 bg-[#181818] px-4 py-3 text-white">
                        <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
                        <div className="flex flex-1 items-center gap-1">
                            {Array.from({ length: 18 }).map((_, index) => (
                                <span
                                    key={index}
                                    className="w-1 rounded-full bg-red-400/80 animate-pulse"
                                    style={{ height: `${8 + (index % 5) * 4}px`, animationDelay: `${index * 60}ms` }}
                                />
                            ))}
                        </div>
                        <span className="text-xs text-[#d0d0d0]">
                            {recordingSeconds}s
                        </span>
                        <button onClick={handleVoice} className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-medium text-white">
                            Send
                        </button>
                    </div>
                ) : (
                <div className="flex items-end gap-2 rounded-[22px] bg-[#181818] px-2 py-2 border border-[#242424]">
                    <button
                        onClick={handleAttach}
                        disabled={uploading}
                        className="p-2 text-[#8a8a8a] hover:text-white rounded-full transition-colors disabled:opacity-50"
                        title="Attach"
                    >
                        <Paperclip className={`w-5 h-5 ${uploading ? 'animate-pulse' : ''}`} />
                    </button>
                    <button onClick={handleMention} className="p-2 text-[#8a8a8a] hover:text-white rounded-full transition-colors" title="Mention">
                        <AtSign className="w-5 h-5" />
                    </button>
                    <input
                        ref={inputRef}
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                        placeholder="Message"
                        className="min-h-10 flex-1 bg-transparent px-1 py-2 text-sm text-white placeholder:text-[#8a8a8a] outline-none"
                        disabled={sending}
                    />
                    <button onClick={() => setShowEmojiPicker(value => !value)} className="p-2 text-[#8a8a8a] hover:text-white rounded-full transition-colors" title="Emoji">
                        <Smile className="w-5 h-5" />
                    </button>
                    <button onClick={handleVoice} className={`p-2 rounded-full transition-colors ${recording ? 'bg-red-500 text-white animate-pulse' : 'text-[#8a8a8a] hover:text-white'}`} title={recording ? 'Stop and send voice' : 'Voice'}>
                        <Mic className="w-5 h-5" />
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={(!newMessage.trim() && !attachmentDraft) || sending || uploading}
                        className="p-2 bg-telegram-primary text-white rounded-full hover:bg-telegram-primary/90 transition-colors disabled:opacity-50"
                        title="Send"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </div>
                )}
            </div>
        </div>
    );
}
