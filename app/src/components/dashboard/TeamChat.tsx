import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { tempDir, join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
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
    Plus,
    UserPlus,
    UserMinus,
    Video,
    ChevronDown,
    ChevronUp,
    ArrowUp,
    ArrowDown,
    Check,
    CheckCheck,
    Users,
    Info,
    Link2,
    LogOut,
    Trash2,
    Share2,
    Star,
} from 'lucide-react';
import { toast } from 'sonner';
import { TelegramAvatar } from './TelegramAvatar';
import { MemberStack } from './MemberStack';
import { VoiceMessage } from './VoiceMessage';
import { readTelegramMessageCache, saveTelegramMessageCache } from './telegramCache';
import { GroupInfo } from './GroupInfo';
import { MemberListModal } from './MemberListModal';
import { SharedMediaModal } from './SharedMediaModal';
import { MessageActions } from './MessageActions';
import { SystemMessage } from './SystemMessage';
import { useConfirm } from '../../context/ConfirmContext';
import { GroupMembersPanel } from './GroupMembersPanel';
import { PinnedMessagesBar } from './PinnedMessagesBar';
import { ForwardPickerModal } from './ForwardPickerModal';
import { StarredMessages } from './StarredMessages';
import { SelectionBar, SelectionDeleteConfirm } from './SelectionBar';
import { useRealtime } from '../../hooks/useRealtime';
import { formatTime, formatDateSeparator, formatDisplayDate, dateKey } from '../../utils';

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
    edited?: boolean;
    audio_duration?: number | null;
    message_type?: string;
    action_params?: string | null;
}

interface MessagesResponse {
    messages: ChatMessage[];
    next_before_message_id: number | null;
    has_more: boolean;
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

interface PinnedMessageInfo {
    message_id: number;
    text: string;
    sender_name: string;
    date: string;
}



const MESSAGES_PAGE_SIZE = 50;
const SCROLLBACK_THRESHOLD = 120;
const PRESENCE_POLL_INTERVAL = 30000;

interface TeamChatProps {
    groupId: number | null;
    groupName: string;
    groupPhotoUrl?: string | null;
    memberCount?: number;
    canManageMembers?: boolean;
    isDirect?: boolean;
    mentionableMembers?: MentionableMember[];
    currentUserId?: string;
    onManageMembers?: () => void;
    onOpenDirectChat?: (user: { user_id: number; first_name: string; photo_url?: string | null }) => void;
    members?: any[];
}

export function TeamChat({
    groupId,
    groupName,
    groupPhotoUrl,
    memberCount,
    canManageMembers = false,
    isDirect = false,
    mentionableMembers = [],
    currentUserId,
    onManageMembers,
    onOpenDirectChat,
    members = [],
}: TeamChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [hasOlderMessages, setHasOlderMessages] = useState(false);
    const [beforeMessageId, setBeforeMessageId] = useState<number | null>(null);
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
    const [downloadingId, setDownloadingId] = useState<number | null>(null);
    const [streamToken, setStreamToken] = useState('');
    const [streamBaseUrl, setStreamBaseUrl] = useState('http://localhost:14201');
    const [showPlusMenu, setShowPlusMenu] = useState(false);
    const [showGroupMembersPanel, setShowGroupMembersPanel] = useState(false);
    const [membersExpanded, setMembersExpanded] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResultIds, setSearchResultIds] = useState<number[]>([]);
    const [searchCurrentIdx, setSearchCurrentIdx] = useState(0);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

    const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
    const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
    const [editText, setEditText] = useState('');
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<ChatMessage | null>(null);
    const [deleteForEveryone, setDeleteForEveryone] = useState(false);
    const [showMessageInfo, setShowMessageInfo] = useState<ChatMessage | null>(null);

    const [showThreeDotMenu, setShowThreeDotMenu] = useState(false);
    const [showMemberListModal, setShowMemberListModal] = useState(false);
    const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
    const [showSharedMediaModal, setShowSharedMediaModal] = useState(false);
    const [sharedMediaTab, setSharedMediaTab] = useState<'all' | 'media'>('all');
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [clearedUpTo, setClearedUpTo] = useState<Record<string, number>>(() => {
        try {
            const raw = window.localStorage.getItem('tgguild.clearedChats.v1');
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    });
    const [deletedMessageIds, setDeletedMessageIds] = useState<Record<string, number[]>>(() => {
        try {
            const raw = window.localStorage.getItem('tgguild.deletedMessages.v1');
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    });
    const menuRef = useRef<HTMLDivElement>(null);

    const [pinnedMessages, setPinnedMessages] = useState<PinnedMessageInfo[]>([]);
    const [showForwardModal, setShowForwardModal] = useState(false);
    const [showStarredView, setShowStarredView] = useState(false);
    const [selectedMessageIds, setSelectedMessageIds] = useState<Set<number>>(new Set());
    const [showSelectionDelete, setShowSelectionDelete] = useState(false);
    const [starStatus, setStarStatus] = useState<Record<string, boolean>>({});

    const realtime = useRealtime(groupId, isDirect);
    const { confirm } = useConfirm();

    useEffect(() => {
        if (!showThreeDotMenu) return;
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowThreeDotMenu(false);
            }
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [showThreeDotMenu]);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const recordingChunksRef = useRef<BlobPart[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const sortedMembers = useMemo(() => {
        return [...members].sort((a, b) => 
            (a.first_name || '').localeCompare(b.first_name || '')
        );
    }, [members]);

    const displayedMembers = membersExpanded ? sortedMembers : sortedMembers.slice(0, 3);
    const hasMoreMembers = sortedMembers.length > 3;

    const handleRemoveMember = async (e: React.MouseEvent, member: any) => {
        e.stopPropagation();
        if (!groupId) return;
        try {
            await invoke('cmd_remove_team_member', {
                teamId: groupId,
                userIdStr: String(member.user_id),
                accessHashStr: member.access_hash,
            });
            toast.success(`Removed ${member.first_name}`);
        } catch (e) {
            toast.error(`Failed to remove: ${e}`);
        }
    };
    const peerKeyRef = useRef('');
    const peerKey = groupId === null ? 'saved' : String(groupId);
    const displayMessages = useMemo(() => {
        const upTo = clearedUpTo[peerKey];
        const deletedIds = new Set(deletedMessageIds[peerKey] || []);
        let filtered = messages;
        if (upTo) filtered = filtered.filter(msg => msg.id > upTo);
        if (deletedIds.size > 0) filtered = filtered.filter(msg => !deletedIds.has(msg.id));
        return filtered;
    }, [messages, clearedUpTo, deletedMessageIds, peerKey]);

    useEffect(() => {
        peerKeyRef.current = peerKey;
        const cached = readTelegramMessageCache<ChatMessage>(peerKey);
        const hasCachedMessages = Boolean(cached?.messages.length);

        setMessages(cached?.messages || []);
        setBeforeMessageId(cached?.nextBeforeMessageId || null);
        setHasOlderMessages(Boolean(cached?.hasMore));
        setLoading(!hasCachedMessages);
        setLoadingOlder(false);
        setError(null);
        if (hasCachedMessages) {
            scrollToBottom('auto');
        }

        loadMessages({ silent: hasCachedMessages, forceScroll: !hasCachedMessages });
        const timer = window.setInterval(() => loadMessages({ silent: true }), 5000);
        return () => window.clearInterval(timer);
    }, [groupId]);

    useEffect(() => {
        invoke<StreamInfo>('cmd_get_stream_info')
            .then((info) => {
                setStreamToken(info.token);
                setStreamBaseUrl(info.base_url);
            })
            .catch(console.error);
    }, []);

    // Fetch presence for direct chat partner
    useEffect(() => {
        if (isDirect && groupId && groupId > 0) {
            realtime.fetchPresence([groupId]);
            const timer = setInterval(() => realtime.fetchPresence([groupId]), PRESENCE_POLL_INTERVAL || 30000);
            return () => clearInterval(timer);
        }
    }, [isDirect, groupId, realtime]);

    useEffect(() => {
        if (!recording || !recordingStartedAt) return;
        const timer = window.setInterval(() => {
            setRecordingSeconds(Math.max(1, Math.floor((Date.now() - recordingStartedAt) / 1000)));
        }, 500);
        return () => window.clearInterval(timer);
    }, [recording, recordingStartedAt]);

    useEffect(() => {
        if (displayMessages.length === 0) return;
        saveTelegramMessageCache(peerKey, displayMessages, beforeMessageId, hasOlderMessages);
    }, [displayMessages, beforeMessageId, hasOlderMessages, peerKey]);

    // Mark messages as read when they are visible
    useEffect(() => {
        if (displayMessages.length === 0) return;
        const maxId = displayMessages
            .filter(msg => !msg.outgoing && !msg.pending)
            .reduce((max, msg) => Math.max(max, msg.id), 0);
        if (maxId > 0) {
            realtime.markAsRead(maxId);
        }
    }, [displayMessages, realtime]);

    // Fetch read receipts for outgoing messages periodically
    useEffect(() => {
        if (!groupId || displayMessages.length === 0) return;
        const outgoingIds = displayMessages
            .filter(msg => msg.outgoing && !msg.pending)
            .map(msg => msg.id)
            .filter(id => id > 0);
        if (outgoingIds.length === 0) return;

        const fetchReads = async () => {
            for (const id of outgoingIds) {
                realtime.fetchReadStatus(id);
            }
        };
        fetchReads();
        const timer = setInterval(fetchReads, 15000);
        return () => clearInterval(timer);
    }, [groupId, displayMessages, realtime]);

    useEffect(() => {
        if (searchOpen) {
            requestAnimationFrame(() => searchInputRef.current?.focus());
        }
    }, [searchOpen]);

    // Load pinned messages
    useEffect(() => {
        if (!groupId) return;
        invoke<PinnedMessageInfo[]>('cmd_get_pinned_messages', { teamId: groupId })
            .then((result) => setPinnedMessages(result))
            .catch(() => {});
    }, [groupId, displayMessages.length]);

    // Check star status for messages
    useEffect(() => {
        if (!groupId || displayMessages.length === 0) return;
        const checkStarStatus = async () => {
            const statuses: Record<string, boolean> = {};
            const batch = displayMessages.filter(m => !m.pending).slice(-30);
            for (const msg of batch) {
                try {
                    const starred = await invoke<boolean>('cmd_is_message_starred', {
                        chatId: groupId,
                        messageId: msg.id,
                    });
                    statuses[msg.id] = starred;
                } catch {}
            }
            setStarStatus(prev => ({ ...prev, ...statuses }));
        };
        checkStarStatus();
    }, [groupId, displayMessages.length]);

    const isNearBottom = () => {
        const container = messagesContainerRef.current;
        if (!container) return true;
        return container.scrollHeight - container.scrollTop - container.clientHeight < 160;
    };

    const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
        requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior });
        });
    };

    const mergeMessages = (current: ChatMessage[], incoming: ChatMessage[]) => {
        const byId = new Map<number, ChatMessage>();
        [...current, ...incoming].forEach((message) => {
            byId.set(message.id, { ...byId.get(message.id), ...message });
        });

        return Array.from(byId.values()).sort((a, b) => {
            if (a.pending !== b.pending) return a.pending ? 1 : -1;
            if (a.pending && b.pending) return a.date.localeCompare(b.date);
            return a.id - b.id;
        });
    };

    const loadMessages = async ({
        silent = false,
        forceScroll = false,
    }: { silent?: boolean; forceScroll?: boolean } = {}) => {
        try {
            if (!silent) setLoading(true);
            setError(null);
            const shouldStickToBottom = forceScroll || isNearBottom();
            const activePeerKey = peerKey;
            const result = await invoke<MessagesResponse>('cmd_get_team_messages', {
                teamId: groupId,
                limit: MESSAGES_PAGE_SIZE,
            });
            if (peerKeyRef.current !== activePeerKey) return;
            const latestMessages = result.messages.slice().reverse();
            setBeforeMessageId(result.next_before_message_id);
            setHasOlderMessages(result.has_more);
            setMessages((current) => {
                const pending = current.filter(message => message.pending);
                return mergeMessages(current.filter(message => !message.pending), [...latestMessages, ...pending]);
            });
            if (shouldStickToBottom) {
                scrollToBottom(forceScroll ? 'auto' : 'smooth');
            }
        } catch (e) {
            setError(String(e));
            if (!silent) toast.error(`Failed to load messages: ${e}`);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const loadOlderMessages = async () => {
        if (!hasOlderMessages || loadingOlder || !beforeMessageId) return;

        const container = messagesContainerRef.current;
        const previousScrollHeight = container?.scrollHeight || 0;
        const previousScrollTop = container?.scrollTop || 0;

        try {
            setLoadingOlder(true);
            const activePeerKey = peerKey;
            const result = await invoke<MessagesResponse>('cmd_get_team_messages', {
                teamId: groupId,
                limit: MESSAGES_PAGE_SIZE,
                beforeMessageId,
            });
            if (peerKeyRef.current !== activePeerKey) return;
            const olderMessages = result.messages.slice().reverse();
            setBeforeMessageId(result.next_before_message_id);
            setHasOlderMessages(result.has_more);
            setMessages((current) => mergeMessages(olderMessages, current));
            requestAnimationFrame(() => {
                if (!container) return;
                const heightDelta = container.scrollHeight - previousScrollHeight;
                container.scrollTop = previousScrollTop + heightDelta;
            });
        } catch (e) {
            toast.error(`Failed to load older messages: ${e}`);
        } finally {
            setLoadingOlder(false);
        }
    };

    const handleMessagesScroll = () => {
        const container = messagesContainerRef.current;
        if (!container || container.scrollTop > SCROLLBACK_THRESHOLD) return;
        loadOlderMessages();
    };

    const handleSend = async () => {
        if ((!newMessage.trim() && !editText.trim() && !attachmentDraft) || sending || uploading) return;
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
            } else if (editingMessage) {
                await handleSendEdit();
                return;
            } else {
                await invoke('cmd_send_team_message', {
                    teamId: groupId,
                    message: newMessage,
                    replyToMessageId: replyTo?.id ?? null,
                });
            }
            setNewMessage('');
            setReplyTo(null);
            setEditingMessage(null);
            setEditText('');
            loadMessages({ silent: true, forceScroll: true });
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
        const alreadyPinned = pinnedMessages.some(p => p.message_id === messageId);
        try {
            if (alreadyPinned) {
                await invoke('cmd_unpin_team_message', { teamId: groupId, messageId });
                toast.success('Message unpinned');
            } else {
                await invoke('cmd_pin_team_message', { teamId: groupId, messageId });
                toast.success('Message pinned');
            }
            loadMessages({ silent: true });
            const result = await invoke<PinnedMessageInfo[]>('cmd_get_pinned_messages', { teamId: groupId });
            setPinnedMessages(result);
        } catch (e) {
            toast.error(`Failed to ${alreadyPinned ? 'unpin' : 'pin'} message: ${e}`);
        }
    };

    const handleUnpin = async (messageId: number) => {
        try {
            await invoke('cmd_unpin_team_message', { teamId: groupId, messageId });
            toast.success('Message unpinned');
            const result = await invoke<PinnedMessageInfo[]>('cmd_get_pinned_messages', { teamId: groupId });
            setPinnedMessages(result);
        } catch (e) {
            toast.error(`Failed to unpin: ${e}`);
        }
    };

    const handleStarToggle = async (messageId: number) => {
        const key = `${groupId}-${messageId}`;
        const currentlyStarred = starStatus[key] || false;
        try {
            if (currentlyStarred) {
                await invoke('cmd_unstar_message', { chatId: groupId, messageId });
            } else {
                await invoke('cmd_star_message', { chatId: groupId, messageId });
            }
            setStarStatus(prev => ({ ...prev, [key]: !currentlyStarred }));
            toast.success(currentlyStarred ? 'Removed star' : 'Message starred');
        } catch (e) {
            toast.error(`Failed to ${currentlyStarred ? 'unstar' : 'star'} message: ${e}`);
        }
    };

    const handleForward = async (targetIds: number[], sendCopy: boolean) => {
        if (!groupId || selectedMessageIds.size === 0) return;
        try {
            await invoke('cmd_forward_messages', {
                fromChatId: groupId,
                messageIds: Array.from(selectedMessageIds),
                toChatIds: targetIds,
                sendCopy,
            });
            toast.success(`Forwarded ${selectedMessageIds.size} message${selectedMessageIds.size > 1 ? 's' : ''} to ${targetIds.length} chat${targetIds.length > 1 ? 's' : ''}`);
            setShowForwardModal(false);
            setSelectedMessageIds(new Set());
        } catch (e) {
            toast.error(`Failed to forward: ${e}`);
        }
    };

    const handleForwardSingle = async (messageId: number) => {
        setSelectedMessageIds(new Set([messageId]));
        setShowForwardModal(true);
    };

    const handleToggleSelect = (messageId: number) => {
        setSelectedMessageIds(prev => {
            const next = new Set(prev);
            if (next.has(messageId)) next.delete(messageId);
            else next.add(messageId);
            return next;
        });
    };

    const handleCancelSelection = () => {
        setSelectedMessageIds(new Set());
    };

    const handleSelectionDelete = async (revoke: boolean) => {
        if (selectedMessageIds.size === 0) return;
        const deletedIds = new Set(selectedMessageIds);
        try {
            await invoke('cmd_delete_messages', {
                teamId: groupId,
                messageIds: Array.from(deletedIds),
                revoke,
            });
            // Persist deletion so messages stay hidden across reloads
            setDeletedMessageIds((prev) => {
                const existing = new Set(prev[peerKey] || []);
                let changed = false;
                for (const id of deletedIds) {
                    if (!existing.has(id)) { existing.add(id); changed = true; }
                }
                if (!changed) return prev;
                const next = { ...prev, [peerKey]: Array.from(existing) };
                try { window.localStorage.setItem('tgguild.deletedMessages.v1', JSON.stringify(next)); } catch {}
                return next;
            });
            setMessages((prev) => prev.filter((m) => !deletedIds.has(m.id)));
            toast.success(`Deleted ${deletedIds.size} message${deletedIds.size > 1 ? 's' : ''}`);
            setShowSelectionDelete(false);
            setSelectedMessageIds(new Set());
        } catch (e) {
            toast.error(`Failed to delete: ${e}`);
        }
    };

    const handleSelectionStar = async () => {
        for (const id of selectedMessageIds) {
            const key = `${groupId}-${id}`;
            if (!starStatus[key]) {
                try {
                    await invoke('cmd_star_message', { chatId: groupId, messageId: id });
                    setStarStatus(prev => ({ ...prev, [key]: true }));
                } catch {}
            }
        }
        toast.success(`Starred ${selectedMessageIds.size} message${selectedMessageIds.size > 1 ? 's' : ''}`);
        setSelectedMessageIds(new Set());
    };

    const handleSelectionCopy = async () => {
        const texts = displayMessages
            .filter(m => selectedMessageIds.has(m.id))
            .map(m => m.text)
            .filter(Boolean);
        if (texts.length > 0) {
            try {
                await navigator.clipboard.writeText(texts.join('\n\n'));
                toast.success('Copied to clipboard');
            } catch {
                toast.error('Failed to copy');
            }
        }
        setSelectedMessageIds(new Set());
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
                    addPendingAttachment(filePath, 'Voice message', undefined, 'voice');
                    await invoke('cmd_upload_file', {
                        path: filePath,
                        folderId: groupId,
                        virtualFolderId: null,
                        transferId: `voice-${groupId ?? 'self'}-${Date.now()}`,
                    });
                    toast.success('Voice message sent');
                    loadMessages({ silent: true, forceScroll: true });
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

    const addPendingAttachment = (path: string, displayName?: string, caption?: string, mediaType?: string) => {
        const fileName = displayName || getFileName(path);
        const mtype = mediaType || getMediaTypeFromName(fileName);
        setMessages((current) => ([
            ...current,
            {
                id: -Date.now(),
                sender_id: 0,
                sender_name: 'You',
                text: caption || '',
                date: new Date().toISOString().slice(0, 19).replace('T', ' '),
                has_media: true,
                media_type: mtype,
                media_name: fileName,
                media_size: 0,
                mime_type: '',
                outgoing: true,
                pending: true,
            },
        ]));
        scrollToBottom('smooth');
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

    const handleReaction = async (messageId: number, emoji: string) => {
        await realtime.toggleReaction(messageId, emoji);
        setReactionPickerFor(null);
    };

    const getMediaIcon = (type: string) => {
        switch (type) {
            case 'photo':
            case 'image':
                return <ImageIcon className="w-5 h-5" />;
            case 'video':
                return <Film className="w-5 h-5" />;
            case 'voice':
            case 'audio':
                return <Music className="w-5 h-5" />;
            case 'document':
                return <FileText className="w-5 h-5" />;
            default:
                return <Paperclip className="w-5 h-5" />;
        }
    };

    const doSearch = useCallback((query: string) => {
        if (!query.trim()) {
            setSearchResultIds([]);
            setSearchCurrentIdx(0);
            return;
        }
        const lower = query.toLowerCase();
        const ids = displayMessages
            .filter((msg) => !msg.pending && msg.text.toLowerCase().includes(lower))
            .map((msg) => msg.id);
        setSearchResultIds(ids);
        setSearchCurrentIdx(ids.length > 0 ? 0 : 0);
    }, [displayMessages]);

    useEffect(() => {
        if (!searchOpen) return;
        doSearch(searchQuery);
    }, [messages, searchOpen, searchQuery, doSearch]);

    const handleSearchToggle = () => {
        setSearchOpen((open) => {
            if (open) {
                setSearchQuery('');
                setSearchResultIds([]);
                setSearchCurrentIdx(0);
            }
            return !open;
        });
    };

    const handleClearChat = () => {
        setShowThreeDotMenu(false);
        setShowClearConfirm(true);
    };

    const confirmClearChat = () => {
        const maxId = messages.reduce((max, msg) => Math.max(max, msg.id), 0);
        const next = { ...clearedUpTo, [peerKey]: maxId };
        setClearedUpTo(next);
        try { window.localStorage.setItem('tgguild.clearedChats.v1', JSON.stringify(next)); } catch {}
        setMessages([]);
        // Also clear deleted message tracking for this chat
        setDeletedMessageIds((prev) => {
            if (!prev[peerKey]) return prev;
            const next2 = { ...prev };
            delete next2[peerKey];
            try { window.localStorage.setItem('tgguild.deletedMessages.v1', JSON.stringify(next2)); } catch {}
            return next2;
        });
        try {
            window.localStorage.removeItem(`tgguild.telegramMessages.v1.${peerKey}`);
        } catch {}
        setShowClearConfirm(false);
        toast.success('Chat cleared');
    };

    const handleReply = (msg: ChatMessage) => {
        setReplyTo(msg);
        setEditingMessage(null);
        inputRef.current?.focus();
    };

    const handleCopy = async (msg: ChatMessage) => {
        if (!msg.text) return;
        try {
            await navigator.clipboard.writeText(msg.text);
            toast.success('Copied to clipboard');
        } catch {
            toast.error('Failed to copy');
        }
    };

    const handleStartEdit = (msg: ChatMessage) => {
        setEditingMessage(msg);
        setEditText(msg.text);
        setReplyTo(null);
        inputRef.current?.focus();
    };

    const handleCancelEdit = () => {
        setEditingMessage(null);
        setEditText('');
    };

    const handleSendEdit = async () => {
        if (!editingMessage || !editText.trim()) return;
        try {
            await invoke('cmd_edit_message', {
                teamId: groupId,
                messageId: editingMessage.id,
                text: editText.trim(),
            });
            setEditingMessage(null);
            setEditText('');
            toast.success('Message edited');
            loadMessages({ silent: true });
        } catch (e) {
            toast.error(`Failed to edit: ${e}`);
        }
    };

    const handleDeleteClick = (msg: ChatMessage) => {
        setShowDeleteConfirm(msg);
        setDeleteForEveryone(false);
    };

    const handleConfirmDelete = async () => {
        if (!showDeleteConfirm) return;
        const msg = showDeleteConfirm;
        const deletedId = msg.id;
        setShowDeleteConfirm(null);
        try {
            await invoke('cmd_delete_messages', {
                teamId: groupId,
                messageIds: [deletedId],
                revoke: deleteForEveryone,
            });
            // Persist deletion so the message stays hidden across reloads
            setDeletedMessageIds((prev) => {
                const existing = prev[peerKey] || [];
                if (existing.includes(deletedId)) return prev;
                const next = { ...prev, [peerKey]: [...existing, deletedId] };
                try { window.localStorage.setItem('tgguild.deletedMessages.v1', JSON.stringify(next)); } catch {}
                return next;
            });
            setMessages((prev) => prev.filter((m) => m.id !== deletedId));
            toast.success('Message deleted');
        } catch (e) {
            toast.error(`Failed to delete: ${e}`);
        }
    };

    const handleDeleteChat = async () => {
        setShowThreeDotMenu(false);
        if (!groupId) return;
        if (!window.confirm('Delete this conversation? This action cannot be undone.')) return;
        try {
            await invoke('cmd_delete_direct_chat', { userId: groupId });
            toast.success('Chat deleted');
            window.location.reload();
        } catch (e) {
            toast.error(`Failed to delete chat: ${e}`);
        }
    };

    const handleInvite = async () => {
        setShowThreeDotMenu(false);
        if (!groupId) return;
        try {
            const link = await invoke<string>('cmd_get_team_invite_link', { teamId: groupId });
            await navigator.clipboard.writeText(link);
            toast.success('Invite link copied to clipboard!');
        } catch (e) {
            toast.error(`Failed to generate invite link: ${e}`);
        }
    };

    const handleStartMeeting = async () => {
        if (!groupId) return;
        try {
            const status = await invoke<{ connected: boolean; email: string | null }>('cmd_google_auth_status');
            if (!status.connected) {
                const auth = await invoke<{ url: string; callback_port: number | null }>('cmd_google_auth_url');
                window.location.href = auth.url;
                toast.info('Complete Google authentication in your browser, then click the video button again.');
                return;
            }
            const meet = await invoke<{ meet_url: string; event_id: string }>('cmd_google_create_meet', {
                summary: groupName,
                creatorName: '',
            });
            const msg = `Join Google Meet: ${meet.meet_url}`;
            await invoke('cmd_send_team_message', { teamId: groupId, message: msg });
            toast.success('Meeting created! Link sent to chat.');
        } catch (e) {
            toast.error(`Failed to create meeting: ${e}`);
        }
    };

    const handleLeave = async () => {
        setShowThreeDotMenu(false);
        if (!groupId) return;
        const confirmed = await confirm({
            title: 'Leave Group',
            message: 'Are u sure want to leave the group?',
            confirmText: 'Yes',
            cancelText: 'No',
            variant: 'danger'
        });
        if (!confirmed) return;
        try {
            await invoke('cmd_leave_team', { teamId: groupId });
            window.location.reload();
        } catch (e) {
            console.error('Failed to leave:', e);
        }
    };

    const handleSearchInput = (value: string) => {
        setSearchQuery(value);
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        searchTimerRef.current = setTimeout(() => doSearch(value), 200);
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            handleSearchToggle();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                handleSearchPrev();
            } else {
                handleSearchNext();
            }
        }
    };

    const handleSearchNext = () => {
        if (searchResultIds.length === 0) return;
        setSearchCurrentIdx((prev) => {
            const next = prev < searchResultIds.length - 1 ? prev + 1 : 0;
            scrollToMessageId(searchResultIds[next]);
            return next;
        });
    };

    const handleSearchPrev = () => {
        if (searchResultIds.length === 0) return;
        setSearchCurrentIdx((prev) => {
            const next = prev > 0 ? prev - 1 : searchResultIds.length - 1;
            scrollToMessageId(searchResultIds[next]);
            return next;
        });
    };

    const scrollToMessageId = (messageId: number) => {
        const el = document.getElementById(`msg-${messageId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else if (beforeMessageId) {
            loadOlderMessages();
        }
    };

    const highlightText = (text: string, query: string) => {
        if (!query.trim()) return text;
        const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
        return parts.map((part, i) =>
            part.toLowerCase() === query.toLowerCase()
                ? <mark key={i} className="bg-yellow-300/60 text-inherit rounded-sm px-0.5">{part}</mark>
                : part
        );
    };

    const linkifyText = (text: string): React.ReactNode => {
        const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = urlRegex.exec(text)) !== null) {
            if (match.index > lastIndex) {
                parts.push(text.slice(lastIndex, match.index));
            }
            const url = match[0];
            const validated = url.startsWith('https://') || url.startsWith('http://');
            parts.push(
                <a
                    key={match.index}
                    href={validated ? url : '#'}
                    onClick={(e) => {
                        e.preventDefault();
                        if (validated) shellOpen(url);
                    }}
                    className="text-blue-400 hover:text-blue-300 underline underline-offset-2 decoration-blue-400/40 hover:decoration-blue-300/60 transition-colors break-all"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    {url}
                </a>
            );
            lastIndex = urlRegex.lastIndex;
        }
        if (lastIndex < text.length) {
            parts.push(text.slice(lastIndex));
        }
        return parts.length > 0 ? parts : text;
    };

    const renderMessageContent = (text: string): React.ReactNode => {
        if (searchOpen && searchQuery?.trim()) {
            const highlighted = highlightText(text, searchQuery);
            return (Array.isArray(highlighted) ? highlighted : [highlighted]).map((part) =>
                typeof part === 'string' ? linkifyText(part) : part
            );
        }
        return linkifyText(text);
    };

    return (
        <div className="flex-1 flex flex-col bg-telegram-bg overflow-hidden transition-colors duration-300">
            <div className="h-14 px-4 border-b border-telegram-border bg-telegram-surface flex items-center justify-between flex-shrink-0 transition-colors duration-300">
                <div className="flex items-center gap-3 min-w-0">
                    <div
                        className="w-10 h-10 rounded-full bg-telegram-hover text-telegram-text flex items-center justify-center overflow-hidden transition-colors cursor-pointer"
                        onClick={() => !isDirect && setShowGroupInfoModal(true)}
                        title={isDirect ? '' : 'View group info'}
                    >
                        <TelegramAvatar
                            user={{ user_id: groupId ?? 'self', first_name: groupName, photo_url: groupPhotoUrl }}
                            token={streamToken}
                            baseUrl={streamBaseUrl}
                            size="lg"
                            className="border-0"
                        />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h2
                                className="text-[15px] font-semibold text-telegram-text truncate cursor-pointer"
                                onClick={() => !isDirect && setShowGroupInfoModal(true)}
                                title={isDirect ? '' : 'View group info'}
                            >{groupName}</h2>
                            {isDirect && realtime.presence[String(groupId)]?.online && (
                                <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)] shrink-0" />
                            )}
                        </div>
                        <p
                            className="text-xs text-telegram-subtext truncate cursor-pointer"
                            onClick={() => !isDirect && setShowGroupInfoModal(true)}
                            title={isDirect ? '' : 'View group info'}
                        >
                            {realtime.typingText ? (
                                <span className="text-telegram-primary animate-pulse">{realtime.typingText}</span>
                            ) : isDirect ? (
                                realtime.formatLastSeen(realtime.presence[String(groupId)]) || 'direct chat'
                            ) : (
                                `${memberCount ?? 0} members`
                            )}
                        </p>
                    </div>
                </div>

                {searchOpen ? (
                    <div className="flex items-center gap-2 flex-1 ml-4">
                        <div className="flex items-center flex-1 gap-2 rounded-lg bg-telegram-hover px-3 py-1.5 border border-telegram-border">
                            <Search className="w-4 h-4 text-telegram-subtext shrink-0" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => handleSearchInput(e.target.value)}
                                onKeyDown={handleSearchKeyDown}
                                placeholder="Search messages..."
                                className="flex-1 bg-transparent text-sm text-telegram-text placeholder:text-telegram-subtext outline-none min-w-0"
                                autoFocus
                            />
                            {searchQuery && (
                                <button onClick={() => { setSearchQuery(''); doSearch(''); }} className="p-0.5 text-telegram-subtext hover:text-telegram-text rounded-full">
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        {searchResultIds.length > 0 && (
                            <div className="flex items-center gap-1 shrink-0">
                                <span className="text-xs text-telegram-subtext whitespace-nowrap">
                                    {searchCurrentIdx + 1} of {searchResultIds.length}
                                </span>
                                <button
                                    onClick={handleSearchPrev}
                                    className="p-1.5 text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover rounded-md transition-colors"
                                    title="Previous match (Shift+Enter)"
                                >
                                    <ArrowUp className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={handleSearchNext}
                                    className="p-1.5 text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover rounded-md transition-colors"
                                    title="Next match (Enter)"
                                >
                                    <ArrowDown className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                        <button
                            onClick={handleSearchToggle}
                            className="p-2 text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover rounded-full transition-colors"
                            title="Close search (Escape)"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                ) : (
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleSearchToggle}
                        className="p-2 text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover rounded-full transition-colors"
                        title="Search messages"
                    >
                        <Search className="w-5 h-5" />
                    </button>
                    <button
                        onClick={handleStartMeeting}
                        className="p-2 text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover rounded-full transition-colors"
                        title="Start meeting"
                    >
                        <Video className="w-5 h-5" />
                    </button>
                    <div className="relative">
                        <button
                            onClick={() => setShowThreeDotMenu(!showThreeDotMenu)}
                            className="p-2 text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover rounded-full transition-colors"
                            title="More"
                        >
                            <MoreVertical className="w-5 h-5" />
                        </button>
                        {showThreeDotMenu && (
                            <div
                                ref={menuRef}
                                className="absolute right-0 top-full mt-1 w-56 bg-telegram-surface/95 backdrop-blur-xl border border-telegram-border rounded-xl shadow-2xl z-[1000] overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                            >
                                {isDirect ? (
                                    <>
                                        <button
                                            onClick={() => { setShowThreeDotMenu(false); handleSearchToggle(); }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-telegram-text hover:bg-telegram-hover transition-colors"
                                        >
                                            <Search className="w-4 h-4 text-telegram-subtext" />
                                            Search Messages
                                        </button>
                                        <button
                                            onClick={() => { setShowThreeDotMenu(false); setSharedMediaTab('all'); setShowSharedMediaModal(true); }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-telegram-text hover:bg-telegram-hover transition-colors"
                                        >
                                            <Paperclip className="w-4 h-4 text-telegram-subtext" />
                                            Shared Files
                                        </button>
                                        <button
                                            onClick={() => { setShowThreeDotMenu(false); setSharedMediaTab('media'); setShowSharedMediaModal(true); }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-telegram-text hover:bg-telegram-hover transition-colors"
                                        >
                                            <ImageIcon className="w-4 h-4 text-telegram-subtext" />
                                            Shared Media
                                        </button>
                                        <div className="h-px bg-telegram-border my-1" />
                                        <button
                                            onClick={handleClearChat}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Clear Chat
                                        </button>
                                        <button
                                            onClick={handleDeleteChat}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            Delete Chat
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => { setShowThreeDotMenu(false); handleSearchToggle(); }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-telegram-text hover:bg-telegram-hover transition-colors"
                                        >
                                            <Search className="w-4 h-4 text-telegram-subtext" />
                                            Search Messages
                                        </button>
                                        <button
                                            onClick={() => { setShowThreeDotMenu(false); setShowMemberListModal(true); }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-telegram-text hover:bg-telegram-hover transition-colors"
                                        >
                                            <Users className="w-4 h-4 text-telegram-subtext" />
                                            Members List
                                        </button>
                                        <button
                                            onClick={() => { setShowThreeDotMenu(false); setShowGroupInfoModal(true); }}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-telegram-text hover:bg-telegram-hover transition-colors"
                                        >
                                            <Info className="w-4 h-4 text-telegram-subtext" />
                                            Group Info
                                        </button>
                                        <button
                                            onClick={handleInvite}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-telegram-text hover:bg-telegram-hover transition-colors"
                                        >
                                            <Link2 className="w-4 h-4 text-telegram-subtext" />
                                            Invite Members
                                        </button>
                                        <div className="h-px bg-telegram-border my-1" />
                                        <button
                                            onClick={handleClearChat}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Clear Chat
                                        </button>
                                        <div className="h-px bg-telegram-border my-1" />
                                        <button
                                            onClick={handleLeave}
                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                        >
                                            <LogOut className="w-4 h-4" />
                                            Leave Group
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {!isDirect && (
                        <div className="flex items-center gap-3 ml-2 border-l border-telegram-border pl-4">
                            <button
                                onClick={() => setShowGroupMembersPanel(true)}
                                className="transition-transform hover:scale-105 active:scale-95"
                                title="View all members"
                            >
                                <MemberStack members={sortedMembers} size="sm" />
                            </button>
                            <div className="relative">
                                <button
                                    onClick={() => setShowPlusMenu(!showPlusMenu)}
                                    className="w-8 h-8 rounded-full bg-telegram-primary/10 hover:bg-telegram-primary/20 text-telegram-primary flex items-center justify-center transition-all shadow-sm active:scale-95"
                                    title="Options"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                                {showPlusMenu && (
                                    <div className="absolute right-0 top-full mt-2 w-72 bg-telegram-surface border border-telegram-border rounded-xl shadow-2xl z-[1000] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                        <div className="p-3 border-b border-telegram-border bg-telegram-hover/30 flex items-center justify-between">
                                            <span className="text-xs font-bold text-telegram-subtext uppercase tracking-wider">Members ({sortedMembers.length})</span>
                                            {hasMoreMembers && (
                                                <button
                                                    onClick={() => setMembersExpanded(!membersExpanded)}
                                                    className="text-[10px] text-telegram-primary hover:underline flex items-center gap-1"
                                                >
                                                    {membersExpanded ? <><ChevronUp className="w-3 h-3"/> Less</> : <><ChevronDown className="w-3 h-3"/> More</>}
                                                </button>
                                            )}
                                        </div>
                                        <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                            {displayedMembers.map(member => (
                                                <div key={member.user_id} className="flex items-center gap-3 p-2 hover:bg-telegram-hover transition-colors group">
                                                    <TelegramAvatar user={member} token={streamToken} size="sm" />
                                                    <span className="flex-1 text-sm text-telegram-text truncate">{member.first_name} {member.last_name || ''}</span>
                                                    {canManageMembers && !member.is_owner && (
                                                        <button
                                                            onClick={(e) => handleRemoveMember(e, member)}
                                                            className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-red-400 rounded-md transition-all"
                                                            title="Remove"
                                                        >
                                                            <UserMinus className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        {canManageMembers && (
                                            <button
                                                onClick={() => {
                                                    setShowPlusMenu(false);
                                                    onManageMembers?.();
                                                }}
                                                className="w-full flex items-center gap-2 p-3 text-sm text-telegram-primary hover:bg-telegram-primary/10 transition-colors border-t border-telegram-border"
                                            >
                                                <UserPlus className="w-4 h-4" />
                                                Add People
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                )}
            </div>

            {showStarredView ? (
                <StarredMessages
                    open={showStarredView}
                    onClose={() => setShowStarredView(false)}
                    onJumpToMessage={(chatId, messageId) => {
                        if (chatId === groupId) {
                            const el = document.getElementById(`msg-${messageId}`);
                            if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); return true; }
                        }
                        return false;
                    }}
                />
            ) : (
            <>
            <PinnedMessagesBar
                pinnedMessages={pinnedMessages}
                onJumpToMessage={(messageId) => {
                    const el = document.getElementById(`msg-${messageId}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                onUnpin={(messageId) => handleUnpin(messageId)}
                onShowAll={() => setShowStarredView(true)}
                canUnpin={true}
            />
            <div
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
                className="flex-1 overflow-y-auto px-4 py-5 custom-scrollbar"
            >
                {loading ? (
                    <div className="h-full flex items-center justify-center text-sm text-telegram-subtext">Loading messages...</div>
                ) : error && displayMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-sm text-telegram-subtext">
                        <p className="text-red-400">Error loading messages</p>
                        <p className="mt-2 max-w-md text-center text-xs">{error}</p>
                        <button onClick={() => loadMessages({ forceScroll: true })} className="mt-4 px-4 py-2 bg-telegram-primary text-white rounded-lg">
                            Retry
                        </button>
                    </div>
                ) : displayMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-sm text-telegram-subtext">
                        {clearedUpTo[peerKey] ? 'Chat cleared' : 'No messages yet'}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {(loadingOlder || hasOlderMessages) && (
                            <div className="flex justify-center py-1">
                                <button
                                    onClick={loadOlderMessages}
                                    disabled={loadingOlder}
                                    className="rounded-full px-3 py-1 text-xs text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text disabled:opacity-60 transition-colors"
                                >
                                    {loadingOlder ? 'Loading older messages...' : 'Load older messages'}
                                </button>
                            </div>
                        )}
                        {displayMessages.map((msg, index) => {
                            const outgoing = Boolean(msg.outgoing);
                            const currentDateKey = dateKey(msg.date);
                            const previousDateKey = index > 0 ? dateKey(displayMessages[index - 1].date) : null;
                            const showDateSeparator = currentDateKey !== previousDateKey;
                            const isSystem = msg.message_type === 'system';
                            return (
                                <div key={msg.id} id={`msg-${msg.id}`}>
                                    {showDateSeparator && (
                                        <div className="sticky top-2 z-10 my-4 flex justify-center">
                                            <span className="rounded-full border border-telegram-border bg-telegram-surface/95 px-3 py-1 text-[11px] font-medium text-telegram-subtext shadow-sm backdrop-blur transition-colors">
                                                {formatDateSeparator(msg.date)}
                                            </span>
                                        </div>
                                    )}
                                    {isSystem ? (
                                        <SystemMessage
                                            text={msg.text}
                                            actionParams={msg.action_params}
                                            onJumpToPinned={(pinnedId) => {
                                                const el = document.getElementById(`msg-${pinnedId}`);
                                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                            }}
                                        />
                                    ) : (
                                    <div className={`group flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`relative flex gap-2 max-w-[78%] ${outgoing ? 'flex-row-reverse' : ''}`}>
                                            {!outgoing && !isDirect && (
                                                <div
                                                    className="cursor-pointer"
                                                    onClick={() => onOpenDirectChat?.({ user_id: msg.sender_id, first_name: msg.sender_name, photo_url: msg.sender_photo_url })}
                                                >
                                                    <TelegramAvatar
                                                        user={{ user_id: msg.sender_id, first_name: msg.sender_name, photo_url: msg.sender_photo_url }}
                                                        token={streamToken}
                                                        baseUrl={streamBaseUrl}
                                                        size="md"
                                                        className="mt-1"
                                                    />
                                                </div>
                                            )}
                                            <MessageActions
                                                isOutgoing={outgoing}
                                                canEdit={Boolean(outgoing && !msg.pending)}
                                                onReply={() => handleReply(msg)}
                                                onCopy={() => handleCopy(msg)}
                                                onEdit={() => handleStartEdit(msg)}
                                                onDelete={() => handleDeleteClick(msg)}
                                                onInfo={() => setShowMessageInfo(msg)}
                                                onReact={() => setReactionPickerFor(reactionPickerFor === msg.id ? null : msg.id)}
                                                onPin={() => handlePin(msg.id)}
                                                isPinned={pinnedMessages.some(p => p.message_id === msg.id)}
                                                onStar={() => handleStarToggle(msg.id)}
                                                isStarred={starStatus[`${groupId}-${msg.id}`] || false}
                                                onForward={() => handleForwardSingle(msg.id)}
                                                isSelected={selectedMessageIds.has(msg.id)}
                                                onToggleSelect={() => handleToggleSelect(msg.id)}
                                            />
                                            <div
                                                className={`rounded-[18px] px-3 py-2 shadow-sm transition-colors duration-300 ${
                                                    outgoing
                                                        ? 'rounded-br-md bg-telegram-primary/10 text-telegram-text border border-telegram-primary/20'
                                                        : 'rounded-bl-md bg-telegram-surface text-telegram-text border border-telegram-border'
                                                } ${
                                                    searchOpen && searchResultIds[searchCurrentIdx] === msg.id
                                                        ? 'ring-2 ring-telegram-primary/60'
                                                        : ''
                                                } ${
                                                    selectedMessageIds.has(msg.id)
                                                        ? 'ring-2 ring-telegram-primary'
                                                        : ''
                                                }`}
                                            >
                                                {!outgoing && !isDirect && (
                                                    <p
                                                        className="mb-1 text-xs font-semibold text-telegram-primary cursor-pointer hover:underline"
                                                        onClick={() => onOpenDirectChat?.({ user_id: msg.sender_id, first_name: msg.sender_name, photo_url: msg.sender_photo_url })}
                                                    >
                                                        {msg.sender_name}
                                                    </p>
                                                )}
                                                {msg.has_media && msg.media_type !== 'none' && (
                                                    <div className="mb-2 overflow-hidden rounded-xl">
                                                        {['photo', 'image'].includes(msg.media_type) && mediaStreamUrl(msg) ? (
                                                            <button onClick={() => handleDownload(msg)} className="block max-w-80 overflow-hidden rounded-xl bg-black/5">
                                                                <img src={mediaStreamUrl(msg) || ''} alt="" className="max-h-80 w-full object-cover" />
                                                            </button>
                                                        ) : null}
                                                        {msg.media_type === 'voice' ? (
                                                            <div className={`rounded-xl p-3 ${outgoing ? 'bg-telegram-primary/20' : 'bg-telegram-hover'}`}>
                                                                <VoiceMessage
                                                                    streamUrl={mediaStreamUrl(msg)}
                                                                    duration={msg.audio_duration}
                                                                    pending={msg.pending}
                                                                />
                                                            </div>
                                                        ) : ['photo', 'image'].includes(msg.media_type) ? null : (
                                                        <button
                                                            onClick={() => handleDownload(msg)}
                                                            disabled={downloadingId === msg.id || msg.pending}
                                                            className={`mt-1 flex w-full min-w-56 items-center gap-3 rounded-xl p-3 text-left transition-colors ${
                                                                outgoing ? 'bg-telegram-primary/20 hover:bg-telegram-primary/30' : 'bg-telegram-hover hover:bg-telegram-border'
                                                            } disabled:opacity-60`}
                                                        >
                                                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-telegram-primary/20 text-telegram-primary">
                                                                {downloadingId === msg.id || msg.pending ? <File className="w-5 h-5 animate-pulse" /> : getMediaIcon(msg.media_type)}
                                                            </span>
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block truncate text-sm font-medium">{msg.media_name || msg.media_type}</span>
                                                                <span className="text-xs opacity-75">{msg.pending ? 'Sending...' : msg.media_size > 0 ? formatFileSize(msg.media_size) : 'Attachment'}</span>
                                                            </span>
                                                            {!msg.pending && <Download className="w-4 h-4 opacity-75" />}
                                                        </button>
                                                        )}
                                                    </div>
                                                )}
                                                {msg.text && (
                                                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                                                        {renderMessageContent(msg.text)}
                                                    </p>
                                                )}
                                                <div className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] ${outgoing ? 'text-telegram-primary/60' : 'text-telegram-subtext'}`}>
                                                    {msg.edited && <span className="italic">edited</span>}
                                                    {starStatus[`${groupId}-${msg.id}`] && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />}
                                                    {pinnedMessages.some(p => p.message_id === msg.id) && <Pin className="h-3 w-3 rotate-45 text-telegram-primary" />}
                                                    <button
                                                        onClick={() => handlePin(msg.id)}
                                                        className={`opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 ${
                                                            pinnedMessages.some(p => p.message_id === msg.id) ? 'text-telegram-primary' : ''
                                                        }`}
                                                        title={pinnedMessages.some(p => p.message_id === msg.id) ? 'Unpin' : 'Pin'}
                                                    >
                                                        <Pin className={`h-3 w-3 ${pinnedMessages.some(p => p.message_id === msg.id) ? 'rotate-45' : ''}`} />
                                                    </button>
                                                    <span>{formatTime(msg.date)}</span>
                                                    {outgoing && !msg.pending && (
                                                        <span className="flex items-center" title={
                                                            isDirect
                                                                ? (realtime.readStatuses[msg.id]?.is_read ? 'Read' : 'Delivered')
                                                                : `${realtime.readStatuses[msg.id]?.read_count || 0} read`
                                                        }>
                                                            {isDirect ? (
                                                                realtime.readStatuses[msg.id]?.is_read
                                                                    ? <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
                                                                    : <CheckCheck className="w-3.5 h-3.5" />
                                                            ) : (
                                                                <span className="flex items-center gap-0.5 text-telegram-subtext">
                                                                    <CheckCheck className="w-3 h-3" />
                                                                    <span>{realtime.readStatuses[msg.id]?.read_count || 0}</span>
                                                                </span>
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                                {(realtime.reactions[String(msg.id)]?.length || reactionPickerFor === msg.id) && (
                                                    <div className="relative mt-1 flex flex-wrap justify-end gap-1">
                                                        {realtime.reactions[String(msg.id)]?.map(reaction => (
                                                            <button
                                                                key={reaction.emoji}
                                                                onClick={() => handleReaction(msg.id, reaction.emoji)}
                                                                title={reaction.reactors.length > 0 ? reaction.reactors.join(', ') : undefined}
                                                                className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                                                                    reaction.chosen
                                                                        ? 'bg-telegram-primary/20 border border-telegram-primary/40'
                                                                        : 'bg-telegram-hover hover:bg-telegram-border'
                                                                }`}
                                                            >
                                                                {reaction.emoji} {reaction.count > 1 && <span className="ml-0.5">{reaction.count}</span>}
                                                            </button>
                                                        ))}
                                                        {reactionPickerFor === msg.id && (
                                                            <div className="absolute bottom-7 right-0 flex rounded-full border border-telegram-border bg-telegram-surface p-1 shadow-2xl z-50 transition-colors">
                                                                {reactionEmojis.map(emoji => (
                                                                    <button
                                                                        key={emoji}
                                                                        onClick={() => handleReaction(msg.id, emoji)}
                                                                        className="rounded-full p-1.5 text-lg hover:bg-telegram-hover transition-colors"
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
                                                    className="mt-1 text-[10px] text-telegram-subtext opacity-0 transition-opacity group-hover:opacity-100 hover:text-telegram-primary"
                                                >
                                                    <Share2 className="w-3 h-3 inline-block mr-0.5" />
                                                    React
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="relative border-t border-telegram-border bg-telegram-surface p-3 flex-shrink-0 transition-colors duration-300">
                {attachmentDraft && (
                    <div className="mb-2 flex items-center gap-3 rounded-xl border border-telegram-border bg-telegram-hover p-3 transition-colors">
                        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-telegram-primary/20 text-telegram-primary">
                            {getMediaIcon(attachmentDraft.mediaType)}
                        </span>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-telegram-text">{attachmentDraft.name}</p>
                            <p className="text-xs text-telegram-subtext">Add a caption, then send</p>
                        </div>
                        <button
                            onClick={() => setAttachmentDraft(null)}
                            className="rounded-full p-2 text-telegram-subtext hover:bg-telegram-border hover:text-telegram-text transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                )}
                {mentionOptions.length > 0 && (
                    <div className="absolute bottom-[74px] left-14 w-72 overflow-hidden rounded-xl border border-telegram-border bg-telegram-surface shadow-2xl z-50 transition-colors">
                        {mentionOptions.map(option => (
                            <button
                                key={option.label}
                                onClick={() => handleMentionSelect(option.label)}
                                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-telegram-hover transition-colors"
                            >
                                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-telegram-primary/10 text-xs font-semibold text-telegram-primary">
                                    {option.label === '@all' ? 'ALL' : option.description.charAt(0).toUpperCase()}
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate text-sm text-telegram-text">{option.label}</span>
                                    <span className="block truncate text-xs text-telegram-subtext">{option.description}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                )}
                {showEmojiPicker && (
                    <div className="absolute bottom-[74px] right-14 grid w-64 grid-cols-6 gap-1 rounded-xl border border-telegram-border bg-telegram-surface p-2 shadow-2xl z-50 transition-colors">
                        {emojis.map(emoji => (
                            <button
                                key={emoji}
                                onClick={() => {
                                    setNewMessage(value => `${value}${emoji}`);
                                    setShowEmojiPicker(false);
                                    requestAnimationFrame(() => inputRef.current?.focus());
                                }}
                                className="rounded-lg p-2 text-xl hover:bg-telegram-hover transition-colors"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                )}
                {recording ? (
                    <div className="flex items-center gap-3 rounded-[22px] border border-red-500/40 bg-telegram-hover px-4 py-3 text-telegram-text transition-colors">
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
                        <span className="text-xs text-telegram-subtext">
                            {recordingSeconds}s
                        </span>
                        <button onClick={handleVoice} className="rounded-full bg-red-500 px-3 py-1.5 text-xs font-medium text-white">
                            Send
                        </button>
                    </div>
                ) : (
                <div className="space-y-1">
                    {replyTo && (
                        <div
                            className="flex items-center gap-2 rounded-xl bg-telegram-hover/60 px-3 py-2 border border-telegram-border/50 cursor-pointer hover:bg-telegram-hover transition-colors"
                            onClick={() => {
                                const el = document.getElementById(`msg-${replyTo.id}`);
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                        >
                            <div className="h-8 w-0.5 shrink-0 rounded-full bg-telegram-primary" />
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-telegram-primary truncate">{replyTo.sender_name}</p>
                                <p className="text-xs text-telegram-subtext truncate">{replyTo.text || replyTo.media_name || 'Media'}</p>
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); setReplyTo(null); }}
                                className="shrink-0 rounded-full p-1 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors"
                                title="Cancel reply"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                    {editingMessage && (
                        <div className="flex items-center gap-2 rounded-xl bg-telegram-hover/60 px-3 py-2 border border-l-2 border-l-yellow-400 border-telegram-border/50">
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium text-yellow-400">Editing message</p>
                                <p className="text-xs text-telegram-subtext truncate">{editingMessage.text || 'Media message'}</p>
                            </div>
                            <button
                                onClick={() => { handleCancelEdit(); realtime.sendTyping(false); }}
                                className="shrink-0 rounded-full p-1 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors"
                                title="Cancel edit"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                    <div className="flex items-end gap-2 rounded-[22px] bg-telegram-hover px-2 py-2 border border-telegram-border transition-colors">
                        <button
                            onClick={handleAttach}
                            disabled={uploading}
                            className="p-2 text-telegram-subtext hover:text-telegram-text rounded-full transition-colors disabled:opacity-50"
                            title="Attach"
                        >
                            <Paperclip className={`w-5 h-5 ${uploading ? 'animate-pulse' : ''}`} />
                        </button>
                        <button onClick={handleMention} className="p-2 text-telegram-subtext hover:text-telegram-text rounded-full transition-colors" title="Mention">
                            <AtSign className="w-5 h-5" />
                        </button>
                        <input
                            ref={inputRef}
                            type="text"
                            value={editingMessage ? editText : newMessage}
                            onChange={(e) => {
                                if (editingMessage) {
                                    setEditText(e.target.value);
                                } else {
                                    setNewMessage(e.target.value);
                                    realtime.handleInputChange();
                                }
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    realtime.sendTyping(false);
                                    handleSend();
                                } else if (e.key === 'Escape') {
                                    if (editingMessage) {
                                        handleCancelEdit();
                                    }
                                    setShowEmojiPicker(false);
                                    setShowPlusMenu(false);
                                }
                            }}
                            placeholder={editingMessage ? 'Edit message...' : replyTo ? 'Reply...' : 'Message'}
                            className="min-h-10 flex-1 bg-transparent px-1 py-2 text-sm text-telegram-text placeholder:text-telegram-subtext outline-none"
                            disabled={sending}
                        />
                        <button onClick={() => setShowEmojiPicker(value => !value)} className="p-2 text-telegram-subtext hover:text-telegram-text rounded-full transition-colors" title="Emoji">
                            <Smile className="w-5 h-5" />
                        </button>
                        <button onClick={handleVoice} className={`p-2 rounded-full transition-colors ${recording ? 'bg-red-500 text-white animate-pulse' : 'text-telegram-subtext hover:text-telegram-text'}`} title={recording ? 'Stop and send voice' : 'Voice'}>
                            <Mic className="w-5 h-5" />
                        </button>
                        <button
                            onClick={handleSend}
                            disabled={(!newMessage.trim() && !editText.trim() && !attachmentDraft) || sending || uploading}
                            className="p-2 bg-telegram-primary text-white rounded-full hover:bg-telegram-primary/90 transition-colors disabled:opacity-50"
                            title={editingMessage ? 'Save' : 'Send'}
                        >
                            {editingMessage ? <Check className="w-5 h-5" /> : <Send className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
                )}
            </div>

            {!showStarredView && (
                <SelectionBar
                    selectedCount={selectedMessageIds.size}
                    onCancel={handleCancelSelection}
                    onForward={() => setShowForwardModal(true)}
                    onDelete={() => setShowSelectionDelete(true)}
                    onStar={handleSelectionStar}
                    onCopy={handleSelectionCopy}
                    canStar={true}
                />
            )}
            <SelectionDeleteConfirm
                open={showSelectionDelete}
                count={selectedMessageIds.size}
                onConfirm={handleSelectionDelete}
                onCancel={() => setShowSelectionDelete(false)}
            />
            <ForwardPickerModal
                open={showForwardModal}
                onClose={() => { setShowForwardModal(false); handleCancelSelection(); }}
                onForward={handleForward}
            />
            </>
            )}

            {showGroupMembersPanel && groupId && (
                <GroupMembersPanel
                    groupId={groupId}
                    currentUserId={currentUserId}
                    canManageMembers={canManageMembers}
                    onClose={() => setShowGroupMembersPanel(false)}
                    onOpenDirectChat={onOpenDirectChat}
                    onMembersChanged={() => loadMessages({})}
                />
            )}
            {showMemberListModal && groupId && (
                <MemberListModal groupId={groupId} onClose={() => setShowMemberListModal(false)} />
            )}
            {showGroupInfoModal && groupId && (
                <GroupInfo
                    groupId={groupId}
                    groupName={groupName}
                    groupPhotoUrl={groupPhotoUrl}
                    streamToken={streamToken}
                    streamBaseUrl={streamBaseUrl}
                    canManageMembers={canManageMembers}
                    currentUserId={currentUserId}
                    onClose={() => setShowGroupInfoModal(false)}
                    onOpenDirectChat={onOpenDirectChat}
                    isDirect={isDirect}
                />
            )}
            {showClearConfirm && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="w-80 rounded-2xl bg-telegram-surface border border-telegram-border shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-100">
                        <h3 className="text-lg font-semibold text-telegram-text mb-2">Clear Chat</h3>
                        <p className="text-sm text-telegram-subtext leading-relaxed mb-6">
                            Clear all messages from your view? This only affects you — other members will still see their messages.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowClearConfirm(false)}
                                className="px-4 py-2 rounded-xl text-sm font-medium text-telegram-text hover:bg-telegram-hover transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmClearChat}
                                className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(null)}>
                    <div className="w-80 rounded-2xl bg-telegram-surface border border-telegram-border shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-100" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-telegram-text mb-2">Delete Message</h3>
                        <p className="text-sm text-telegram-subtext leading-relaxed mb-4">
                            Choose how to delete this message.
                        </p>
                        {showDeleteConfirm.outgoing && (
                            <label className="flex items-center gap-3 rounded-xl bg-telegram-hover/50 px-3 py-2.5 mb-2 cursor-pointer hover:bg-telegram-hover transition-colors">
                                <input
                                    type="checkbox"
                                    checked={deleteForEveryone}
                                    onChange={(e) => setDeleteForEveryone(e.target.checked)}
                                    className="rounded accent-red-500"
                                />
                                <span className="text-sm text-telegram-text">Delete for everyone</span>
                            </label>
                        )}
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowDeleteConfirm(null)}
                                className="px-4 py-2 rounded-xl text-sm font-medium text-telegram-text hover:bg-telegram-hover transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showMessageInfo && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowMessageInfo(null)}>
                    <div className="w-80 rounded-2xl bg-telegram-surface border border-telegram-border shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-100" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-lg font-semibold text-telegram-text mb-4">Message Info</h3>
                        <div className="space-y-3 text-sm">
                            <div>
                                <span className="text-telegram-subtext text-xs">Sender</span>
                                <p className="text-telegram-text">{showMessageInfo.sender_name}</p>
                            </div>
                            <div>
                                <span className="text-telegram-subtext text-xs">Sent</span>
                                <p className="text-telegram-text">{formatDisplayDate(showMessageInfo.date)}</p>
                            </div>
                            {showMessageInfo.edited && (
                                <div>
                                    <span className="text-telegram-subtext text-xs">Status</span>
                                    <p className="text-telegram-text italic">Edited</p>
                                </div>
                            )}
                            {showMessageInfo.has_media && showMessageInfo.media_name && (
                                <div>
                                    <span className="text-telegram-subtext text-xs">File</span>
                                    <p className="text-telegram-text truncate">{showMessageInfo.media_name}</p>
                                </div>
                            )}
                            {showMessageInfo.outgoing && (
                                <div>
                                    <span className="text-telegram-subtext text-xs">Read Receipts</span>
                                    {isDirect ? (
                                        <div className="flex items-center gap-2 mt-1">
                                            {realtime.readStatuses[showMessageInfo.id]?.is_read ? (
                                                <span className="text-blue-400 text-xs flex items-center gap-1">
                                                    <CheckCheck className="w-3.5 h-3.5" /> Read
                                                </span>
                                            ) : (
                                                <span className="text-telegram-subtext text-xs flex items-center gap-1">
                                                    <CheckCheck className="w-3.5 h-3.5" /> Delivered
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-telegram-text text-xs mt-1">
                                            Read by {realtime.readStatuses[showMessageInfo.id]?.read_count || 0} of {memberCount || 0} members
                                        </p>
                                    )}
                                </div>
                            )}
                            {realtime.reactions[String(showMessageInfo.id)]?.length > 0 && (
                                <div>
                                    <span className="text-telegram-subtext text-xs">Reactions</span>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {realtime.reactions[String(showMessageInfo.id)]?.map(r => (
                                            <span key={r.emoji} className="rounded-full bg-telegram-hover px-2 py-0.5 text-xs">
                                                {r.emoji} {r.count}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div>
                                <span className="text-telegram-subtext text-xs">ID</span>
                                <p className="text-telegram-text font-mono">{showMessageInfo.id}</p>
                            </div>
                        </div>
                        <div className="flex justify-end mt-4">
                            <button
                                onClick={() => setShowMessageInfo(null)}
                                className="px-4 py-2 rounded-xl text-sm font-medium text-telegram-text hover:bg-telegram-hover transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showSharedMediaModal && (
                <SharedMediaModal
                    messages={messages}
                    groupName={groupName}
                    onClose={() => setShowSharedMediaModal(false)}
                    onDownload={handleDownload}
                    formatFileSize={formatFileSize}
                    formatTime={formatTime}
                    initialTab={sharedMediaTab}
                />
            )}
        </div>
    );
}
