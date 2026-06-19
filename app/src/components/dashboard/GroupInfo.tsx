import { useState, useEffect, useRef } from 'react';
import { X, Copy, Check, Hash, CalendarDays, Users, Info, Edit3, Save, Loader2, Image, FileText, Video, Music, Paperclip, Pin, Activity, Settings, Bell, BellOff, LogOut, Trash2, RefreshCw } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { formatDateOnly } from '../../utils';
import { TelegramAvatar } from './TelegramAvatar';
import { GroupMembersPanel } from './GroupMembersPanel';

interface TeamFullInfo {
    id: number;
    name: string;
    description: string;
    creation_date: string;
    member_count: number;
    invite_link: string | null;
    is_channel: boolean;
    is_supergroup: boolean;
    can_edit_info: boolean;
}

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

interface PinnedMessageInfo {
    message_id: number;
    text: string;
    sender_name: string;
    date: string;
}

interface GroupInfoProps {
    groupId: number;
    groupName: string;
    groupPhotoUrl?: string | null;
    streamToken: string;
    streamBaseUrl: string;
    canManageMembers?: boolean;
    currentUserId?: string;
    onClose: () => void;
    onOpenDirectChat?: (user: { user_id: number; first_name: string; photo_url?: string | null }) => void;
    isDirect?: boolean;
}

type TabId = 'overview' | 'members' | 'media' | 'files' | 'pins' | 'activity' | 'settings';

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: Info },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'media', label: 'Media', icon: Image },
    { id: 'files', label: 'Files', icon: FileText },
    { id: 'pins', label: 'Pins', icon: Pin },
    { id: 'activity', label: 'Activity', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
];

function formatFileSize(bytes: number) {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function OverviewTab({ groupId, info, onInfoChange, streamToken, streamBaseUrl }: {
    groupId: number;
    info: TeamFullInfo;
    onInfoChange: (info: TeamFullInfo) => void;
    streamToken: string;
    streamBaseUrl: string;
}) {
    const [copied, setCopied] = useState(false);
    const [copiedTgguild, setCopiedTgguild] = useState(false);
    const [editingDesc, setEditingDesc] = useState(false);
    const [editDescription, setEditDescription] = useState('');
    const [saving, setSaving] = useState(false);
    const [inviteLink, setInviteLink] = useState(info.invite_link || '');
    const [tgguildLink, setTgguildLink] = useState<string>('');

    // Convert existing invite link to TGGuild format
    useEffect(() => {
        if (inviteLink) {
            invoke<string>('cmd_to_tgguild_invite_link', { telegramLink: inviteLink })
                .then(setTgguildLink)
                .catch(() => setTgguildLink(''));
        }
    }, [inviteLink]);

    const handleCopyLink = async () => {
        const link = tgguildLink || inviteLink;
        if (!link) return;
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            toast.success('Invite link copied');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy');
        }
    };

    const handleCopyTgguildLink = async () => {
        if (!tgguildLink) return;
        try {
            await navigator.clipboard.writeText(tgguildLink);
            setCopiedTgguild(true);
            toast.success('TGGuild link copied');
            setTimeout(() => setCopiedTgguild(false), 2000);
        } catch {
            toast.error('Failed to copy');
        }
    };

    const handleRevokeLink = async () => {
        try {
            const newLink = await invoke<string>('cmd_revoke_invite_link', { teamId: groupId });
            setInviteLink(newLink);
            toast.success('New invite link generated');
        } catch (e) {
            toast.error(`Failed to revoke: ${e}`);
        }
    };

    const startEditing = () => {
        setEditDescription(info.description || '');
        setEditingDesc(true);
    };

    const cancelEditing = () => {
        setEditingDesc(false);
        setEditDescription('');
    };

    const saveDescription = async () => {
        setSaving(true);
        try {
            await invoke('cmd_edit_team', {
                teamId: groupId,
                newName: null,
                newDescription: editDescription,
            });
            toast.success('Description updated');
            onInfoChange({ ...info, description: editDescription });
            setEditingDesc(false);
        } catch (e) {
            toast.error(`Failed to update description: ${e}`);
        } finally {
            setSaving(false);
        }
    };

    const groupType = info.is_channel
        ? info.is_supergroup ? 'Supergroup (Broadcast)' : 'Channel'
        : info.is_supergroup ? 'Supergroup' : 'Group';

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-telegram-hover/50">
                <div className="w-12 h-12 rounded-full overflow-hidden bg-telegram-hover flex-shrink-0">
                    <TelegramAvatar
                        user={{ user_id: groupId, first_name: info.name, photo_url: null }}
                        token={streamToken}
                        baseUrl={streamBaseUrl}
                        size="lg"
                        className="border-0"
                    />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-telegram-text">{info.name}</p>
                    <p className="text-xs text-telegram-subtext">{groupType}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-3 rounded-xl bg-telegram-hover/30 p-3">
                    <Users className="h-5 w-5 text-telegram-primary" />
                    <div>
                        <p className="text-xs text-telegram-subtext">Members</p>
                        <p className="text-sm font-medium text-telegram-text">{info.member_count}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-telegram-hover/30 p-3">
                    <CalendarDays className="h-5 w-5 text-telegram-primary" />
                    <div>
                        <p className="text-xs text-telegram-subtext">Created</p>
                        <p className="text-sm font-medium text-telegram-text">{formatDateOnly(info.creation_date)}</p>
                    </div>
                </div>
            </div>

            <div className="rounded-xl bg-telegram-hover/30 p-3">
                <div className="flex items-center justify-between mb-1">
                    <p className="text-xs text-telegram-subtext">Description</p>
                    {info.can_edit_info && !editingDesc && (
                        <button onClick={startEditing} className="flex items-center gap-1 text-xs text-telegram-primary hover:underline">
                            <Edit3 className="w-3 h-3" />
                            Edit
                        </button>
                    )}
                </div>
                {editingDesc ? (
                    <div className="space-y-2">
                        <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="w-full rounded-lg bg-telegram-surface border border-telegram-border px-3 py-2 text-sm text-telegram-text outline-none resize-none min-h-[80px] focus:border-telegram-primary/50 transition-colors"
                            placeholder="Add a description..."
                            rows={3}
                            autoFocus
                        />
                        <div className="flex items-center justify-end gap-2">
                            <button onClick={cancelEditing} className="rounded-lg px-3 py-1.5 text-xs text-telegram-subtext hover:bg-telegram-hover transition-colors" disabled={saving}>
                                Cancel
                            </button>
                            <button onClick={saveDescription} className="rounded-lg bg-telegram-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-telegram-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1" disabled={saving}>
                                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                Save
                            </button>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-telegram-text whitespace-pre-wrap break-words">
                        {info.description || (info.can_edit_info ? 'No description set. Click Edit to add one.' : 'No description')}
                    </p>
                )}
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-telegram-hover/30 p-3">
                <Hash className="h-5 w-5 text-telegram-subtext" />
                <div className="min-w-0 flex-1">
                    <p className="text-xs text-telegram-subtext">ID</p>
                    <p className="text-sm font-mono text-telegram-text truncate">{info.id}</p>
                </div>
            </div>

            <div className="rounded-xl bg-telegram-hover/50 p-3">
                <p className="text-xs text-telegram-subtext mb-2">Invite Link</p>
                {inviteLink ? (
                    <div className="space-y-2">
                        {/* TGGuild deep link — primary shareable format */}
                        {tgguildLink && (
                            <div>
                                <p className="text-[10px] text-telegram-primary mb-1">TGGuild Link (share this)</p>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        readOnly
                                        value={tgguildLink}
                                        className="flex-1 rounded-lg bg-telegram-surface border border-telegram-border px-3 py-1.5 text-xs text-telegram-text outline-none font-mono"
                                        onClick={(e) => (e.target as HTMLInputElement).select()}
                                    />
                                    <button
                                        onClick={handleCopyTgguildLink}
                                        className="rounded-lg bg-telegram-primary/10 p-1.5 text-telegram-primary hover:bg-telegram-primary/20 transition-colors"
                                        title="Copy TGGuild link"
                                    >
                                        {copiedTgguild ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                    </button>
                                </div>
                            </div>
                        )}
                        {/* Telegram link */}
                        <div>
                            <p className="text-[10px] text-telegram-subtext mb-1">Telegram Link</p>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={inviteLink}
                                    className="flex-1 rounded-lg bg-telegram-surface border border-telegram-border px-3 py-1.5 text-sm text-telegram-text outline-none"
                                    onClick={(e) => (e.target as HTMLInputElement).select()}
                                />
                                <button
                                    onClick={handleCopyLink}
                                    className="rounded-lg bg-telegram-primary/10 p-2 text-telegram-primary hover:bg-telegram-primary/20 transition-colors"
                                    title="Copy link"
                                >
                                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                </button>
                                <button
                                    onClick={handleRevokeLink}
                                    className="rounded-lg bg-orange-500/10 p-2 text-orange-400 hover:bg-orange-500/20 transition-colors"
                                    title="Generate new link"
                                >
                                    <RefreshCw className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={handleRevokeLink}
                        className="w-full rounded-lg bg-telegram-primary/10 px-3 py-2 text-sm text-telegram-primary hover:bg-telegram-primary/20 transition-colors text-center"
                    >
                        Create Invite Link
                    </button>
                )}
            </div>
        </div>
    );
}

function MembersTab({ groupId, canManageMembers, currentUserId, onClose, onOpenDirectChat }: {
    groupId: number;
    canManageMembers?: boolean;
    currentUserId?: string;
    onClose: () => void;
    onOpenDirectChat?: (user: { user_id: number; first_name: string; photo_url?: string | null }) => void;
}) {
    return (
        <GroupMembersPanel
            groupId={groupId}
            currentUserId={currentUserId}
            canManageMembers={canManageMembers}
            onClose={onClose}
            onOpenDirectChat={onOpenDirectChat}
        />
    );
}

function MediaGrid({ items, type }: { items: ChatMessage[]; type: string }) {
    const iconMap: Record<string, React.ElementType> = {
        photo: Image,
        video: Video,
        audio: Music,
        voice: Music,
        document: FileText,
        file: Paperclip,
    };
    const Icon = iconMap[type] || Paperclip;

    if (items.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-telegram-subtext">
                <Icon className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">No {type} shared yet</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-3 gap-1.5">
            {items.map((msg) => (
                <div key={msg.id} className="aspect-square rounded-lg bg-telegram-hover flex items-center justify-center overflow-hidden group relative cursor-pointer">
                    {type === 'photo' ? (
                        <div className="w-full h-full bg-gradient-to-br from-telegram-hover to-telegram-surface flex items-center justify-center">
                            <Image className="h-8 w-8 text-telegram-subtext/40" />
                        </div>
                    ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2">
                            <Icon className="h-6 w-6 text-telegram-primary/60 mb-1" />
                            <p className="text-[10px] text-telegram-subtext text-center truncate w-full">{msg.media_name}</p>
                            {msg.media_size > 0 && (
                                <p className="text-[9px] text-telegram-subtext/60">{formatFileSize(msg.media_size)}</p>
                            )}
                        </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <p className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                            {new Date(msg.date).toLocaleDateString()}
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
}

function MediaTab({ groupId, mediaFilter }: { groupId: number; mediaFilter: string }) {
    const [items, setItems] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(false);
    const [beforeId, setBeforeId] = useState<number | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);

    const loadMedia = async (silent = false) => {
        try {
            if (!silent) setLoading(true);
            const result = await invoke<MessagesResponse>('cmd_get_team_messages', {
                teamId: groupId,
                limit: 50,
                mediaFilter,
            });
            setItems(result.messages);
            setBeforeId(result.next_before_message_id);
            setHasMore(result.has_more);
        } catch (e) {
            toast.error(`Failed to load ${mediaFilter}: ${e}`);
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const loadMoreMedia = async () => {
        if (!hasMore || loadingMore || !beforeId) return;
        try {
            setLoadingMore(true);
            const result = await invoke<MessagesResponse>('cmd_get_team_messages', {
                teamId: groupId,
                limit: 50,
                beforeMessageId: beforeId,
                mediaFilter,
            });
            setItems(prev => [...prev, ...result.messages]);
            setBeforeId(result.next_before_message_id);
            setHasMore(result.has_more);
        } catch (e) {
            toast.error(`Failed to load more: ${e}`);
        } finally {
            setLoadingMore(false);
        }
    };

    useEffect(() => { loadMedia(); }, [groupId]);

    if (loading) {
        return <div className="flex items-center justify-center py-12 text-sm text-telegram-subtext">Loading {mediaFilter}...</div>;
    }

    return (
        <div>
            <MediaGrid items={items} type={mediaFilter} />
            {hasMore && (
                <button
                    onClick={loadMoreMedia}
                    disabled={loadingMore}
                    className="w-full mt-3 rounded-lg bg-telegram-hover/50 py-2 text-sm text-telegram-subtext hover:bg-telegram-hover transition-colors disabled:opacity-50"
                >
                    {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Load more'}
                </button>
            )}
        </div>
    );
}

function PinsTab({ groupId }: { groupId: number }) {
    const [pins, setPins] = useState<PinnedMessageInfo[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        invoke<PinnedMessageInfo[]>('cmd_get_pinned_messages', { teamId: groupId })
            .then(setPins)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [groupId]);

    if (loading) {
        return <div className="flex items-center justify-center py-12 text-sm text-telegram-subtext">Loading pinned messages...</div>;
    }

    if (pins.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-telegram-subtext">
                <Pin className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">No pinned messages</p>
                <p className="text-xs mt-1">Pin messages from the chat to save them here</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {pins.map((pin) => (
                <div key={pin.message_id} className="rounded-xl bg-telegram-hover/30 p-3 border border-telegram-border/50">
                    <div className="flex items-center gap-2 mb-1">
                        <Pin className="h-3.5 w-3.5 text-telegram-primary" />
                        <span className="text-xs text-telegram-subtext">{pin.sender_name}</span>
                        <span className="text-[10px] text-telegram-subtext/60 ml-auto">{new Date(pin.date).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm text-telegram-text line-clamp-2">{pin.text || '[No text]'}</p>
                </div>
            ))}
        </div>
    );
}

function ActivityTab({ groupId }: { groupId: number }) {
    const [events, setEvents] = useState<ChatMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [hasMore, setHasMore] = useState(false);
    const [beforeId, setBeforeId] = useState<number | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);

    const loadActivity = async () => {
        try {
            setLoading(true);
            const result = await invoke<MessagesResponse>('cmd_get_team_messages', {
                teamId: groupId,
                limit: 50,
                mediaFilter: 'system',
            });
            setEvents(result.messages);
            setBeforeId(result.next_before_message_id);
            setHasMore(result.has_more);
        } catch (e) {
            toast.error(`Failed to load activity: ${e}`);
        } finally {
            setLoading(false);
        }
    };

    const loadMoreActivity = async () => {
        if (!hasMore || loadingMore || !beforeId) return;
        try {
            setLoadingMore(true);
            const result = await invoke<MessagesResponse>('cmd_get_team_messages', {
                teamId: groupId,
                limit: 50,
                beforeMessageId: beforeId,
                mediaFilter: 'system',
            });
            setEvents(prev => [...prev, ...result.messages]);
            setBeforeId(result.next_before_message_id);
            setHasMore(result.has_more);
        } catch (e) {
            toast.error(`Failed to load more: ${e}`);
        } finally {
            setLoadingMore(false);
        }
    };

    useEffect(() => { loadActivity(); }, [groupId]);

    if (loading) {
        return <div className="flex items-center justify-center py-12 text-sm text-telegram-subtext">Loading activity log...</div>;
    }

    if (events.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-telegram-subtext">
                <Activity className="h-10 w-10 mb-2 opacity-40" />
                <p className="text-sm">No recent activity</p>
            </div>
        );
    }

    return (
        <div>
            <div className="space-y-1">
                {events.map((evt) => (
                    <div key={evt.id} className="rounded-lg px-3 py-2 hover:bg-telegram-hover/30 transition-colors">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-telegram-hover flex items-center justify-center text-[10px] font-medium text-telegram-subtext flex-shrink-0">
                                {evt.sender_name.charAt(0)}
                            </div>
                            <p className="text-xs text-telegram-text flex-1">{evt.text}</p>
                            <span className="text-[10px] text-telegram-subtext/60 whitespace-nowrap">{new Date(evt.date).toLocaleDateString()}</span>
                        </div>
                    </div>
                ))}
            </div>
            {hasMore && (
                <button
                    onClick={loadMoreActivity}
                    disabled={loadingMore}
                    className="w-full mt-3 rounded-lg bg-telegram-hover/50 py-2 text-sm text-telegram-subtext hover:bg-telegram-hover transition-colors disabled:opacity-50"
                >
                    {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Load more'}
                </button>
            )}
        </div>
    );
}

function SettingsTab({ groupId, info, onClose, isDirect }: {
    groupId: number;
    info: TeamFullInfo;
    onClose: () => void;
    isDirect?: boolean;
}) {
    const [muted, setMuted] = useState(() => {
        try {
            const prefs = window.localStorage.getItem('tgguild.mutedChats.v1');
            if (prefs) {
                const parsed = JSON.parse(prefs);
                return !!parsed[String(groupId)];
            }
        } catch {}
        return false;
    });

    const handleToggleMute = () => {
        const next = !muted;
        setMuted(next);
        try {
            const prefs = window.localStorage.getItem('tgguild.mutedChats.v1');
            const parsed = prefs ? JSON.parse(prefs) : {};
            parsed[String(groupId)] = next;
            window.localStorage.setItem('tgguild.mutedChats.v1', JSON.stringify(parsed));
        } catch {}
        toast.success(next ? 'Notifications muted' : 'Notifications unmuted');
    };

    const handleLeave = async () => {
        if (!window.confirm('Are you sure you want to leave this group? You can only rejoin via an invite link.')) return;
        try {
            await invoke('cmd_leave_team', { teamId: groupId });
            toast.success('Left the group');
            onClose();
            window.location.reload();
        } catch (e) {
            toast.error(`Failed to leave: ${e}`);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('Are you sure you want to delete this group? This action cannot be undone.')) return;
        try {
            await invoke('cmd_delete_team', { teamId: groupId });
            toast.success('Group deleted');
            onClose();
            window.location.reload();
        } catch (e) {
            toast.error(`Failed to delete: ${e}`);
        }
    };

    return (
        <div className="space-y-3">
            <div className="rounded-xl bg-telegram-hover/30 p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {muted ? <BellOff className="h-5 w-5 text-telegram-subtext" /> : <Bell className="h-5 w-5 text-telegram-primary" />}
                    <div>
                        <p className="text-sm text-telegram-text">Notifications</p>
                        <p className="text-xs text-telegram-subtext">{muted ? 'Muted' : 'Enabled'}</p>
                    </div>
                </div>
                <button
                    onClick={handleToggleMute}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${muted ? 'bg-telegram-primary/10 text-telegram-primary' : 'bg-telegram-hover text-telegram-subtext'}`}
                >
                    {muted ? 'Unmute' : 'Mute'}
                </button>
            </div>

            {info.can_edit_info && (
                <button
                    onClick={() => {
                        const name = window.prompt('Enter new group name:', info.name);
                        if (name && name.trim()) {
                            invoke('cmd_edit_team', { teamId: groupId, newName: name.trim(), newDescription: null })
                                .then(() => toast.success('Group name updated'))
                                .catch((e) => toast.error(`Failed: ${e}`));
                        }
                    }}
                    className="w-full rounded-xl bg-telegram-hover/30 p-3 flex items-center gap-3 hover:bg-telegram-hover transition-colors text-left"
                >
                    <Edit3 className="h-5 w-5 text-telegram-primary" />
                    <div>
                        <p className="text-sm text-telegram-text">Edit Group Name</p>
                        <p className="text-xs text-telegram-subtext">{info.name}</p>
                    </div>
                </button>
            )}

            <div className="border-t border-telegram-border/50 my-2" />

            <div className="space-y-2">
                {!isDirect && (
                    <button
                        onClick={handleLeave}
                        className="w-full rounded-xl bg-red-500/10 p-3 flex items-center gap-3 hover:bg-red-500/20 transition-colors text-left"
                    >
                        <LogOut className="h-5 w-5 text-red-400" />
                        <div>
                            <p className="text-sm text-red-400">Leave Group</p>
                            <p className="text-xs text-telegram-subtext">Remove yourself from this group</p>
                        </div>
                    </button>
                )}
                {info.can_edit_info && (
                    <button
                        onClick={handleDelete}
                        className="w-full rounded-xl bg-red-500/10 p-3 flex items-center gap-3 hover:bg-red-500/20 transition-colors text-left"
                    >
                        <Trash2 className="h-5 w-5 text-red-400" />
                        <div>
                            <p className="text-sm text-red-400">Delete Group</p>
                            <p className="text-xs text-telegram-subtext">Permanently remove this group</p>
                        </div>
                    </button>
                )}
            </div>
        </div>
    );
}

export function GroupInfo({ groupId, groupName, groupPhotoUrl, streamToken, streamBaseUrl, canManageMembers, currentUserId, onClose, onOpenDirectChat, isDirect }: GroupInfoProps) {
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const [info, setInfo] = useState<TeamFullInfo | null>(null);
    const [infoLoading, setInfoLoading] = useState(true);
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        invoke<TeamFullInfo>('cmd_get_team_full_info', { teamId: groupId })
            .then(setInfo)
            .catch((e) => toast.error(`Failed to load group info: ${e}`))
            .finally(() => setInfoLoading(false));
    }, [groupId]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const timer = setTimeout(() => window.addEventListener('mousedown', handler), 50);
        return () => { clearTimeout(timer); window.removeEventListener('mousedown', handler); };
    }, [onClose]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const groupType = info
        ? info.is_channel
            ? info.is_supergroup ? 'Broadcast' : 'Channel'
            : info.is_supergroup ? 'Supergroup' : 'Group'
        : '';

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div ref={panelRef} className="w-full max-w-2xl h-[85vh] flex overflow-hidden rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl">
                {/* Sidebar */}
                <div className="w-48 flex-shrink-0 border-r border-telegram-border bg-telegram-bg flex flex-col">
                    <div className="p-4 border-b border-telegram-border">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-telegram-hover flex-shrink-0">
                                <TelegramAvatar
                                    user={{ user_id: groupId, first_name: groupName, photo_url: groupPhotoUrl }}
                                    token={streamToken}
                                    baseUrl={streamBaseUrl}
                                    size="sm"
                                    className="border-0"
                                />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-telegram-text truncate">{groupName}</p>
                                {groupType && <p className="text-[10px] text-telegram-subtext">{groupType}</p>}
                            </div>
                        </div>
                    </div>
                    <nav className="flex-1 overflow-y-auto p-2 custom-scrollbar space-y-0.5">
                        {tabs.map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                onClick={() => setActiveTab(id)}
                                className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                                    activeTab === id
                                        ? 'bg-telegram-primary/10 text-telegram-primary font-medium'
                                        : 'text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover'
                                }`}
                            >
                                <Icon className="h-4 w-4 flex-shrink-0" />
                                {label}
                            </button>
                        ))}
                    </nav>
                    <div className="p-3 border-t border-telegram-border">
                        <button
                            onClick={onClose}
                            className="w-full flex items-center justify-center gap-2 rounded-lg bg-telegram-hover/50 px-3 py-2 text-sm text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover transition-colors"
                        >
                            <X className="h-4 w-4" />
                            Close
                        </button>
                    </div>
                </div>

                {/* Content area */}
                <div className="flex-1 flex flex-col min-w-0">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-telegram-border">
                        <h3 className="text-base font-semibold text-telegram-text">
                            {tabs.find(t => t.id === activeTab)?.label || 'Group Info'}
                        </h3>
                        <button onClick={onClose} className="rounded-full p-1.5 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors">
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {infoLoading && activeTab === 'overview' ? (
                            <div className="flex items-center justify-center py-16 text-sm text-telegram-subtext">Loading group info...</div>
                        ) : activeTab === 'overview' && info ? (
                            <OverviewTab groupId={groupId} info={info} onInfoChange={setInfo} streamToken={streamToken} streamBaseUrl={streamBaseUrl} />
                        ) : activeTab === 'members' ? (
                            <MembersTab groupId={groupId} canManageMembers={canManageMembers} currentUserId={currentUserId} onClose={onClose} onOpenDirectChat={onOpenDirectChat} />
                        ) : activeTab === 'media' ? (
                            <MediaTab groupId={groupId} mediaFilter="photo" />
                        ) : activeTab === 'files' ? (
                            <MediaTab groupId={groupId} mediaFilter="document" />
                        ) : activeTab === 'pins' ? (
                            <PinsTab groupId={groupId} />
                        ) : activeTab === 'activity' ? (
                            <ActivityTab groupId={groupId} />
                        ) : activeTab === 'settings' && info ? (
                            <SettingsTab groupId={groupId} info={info} onClose={onClose} isDirect={isDirect} />
                        ) : (
                            <div className="flex items-center justify-center py-16 text-sm text-telegram-subtext">Loading...</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
