import { useState, useEffect, ReactNode } from 'react';
import { Building2, HardDrive, Folder, Plus, RefreshCw, LogOut, Users, LayoutGrid, ChevronDown, ChevronRight, Settings, File, Film, Image as ImageIcon, Mic, Music } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { SidebarItem } from './SidebarItem';
import { BandwidthWidget } from './BandwidthWidget';
import { MemberStack } from './MemberStack';
import { TelegramAvatar } from './TelegramAvatar';
import { WorkspaceVisibilityModal } from './WorkspaceVisibilityModal';
import {
    loadWorkspacePrefs,
    saveWorkspacePrefs,
    isGroupVisible,
    isDriveVisible as isDriveVisibleWs,
    isDMVisible,
    WorkspacePrefs,
} from './workspaceVisibility';
import { readTelegramDirectoryCache, saveTelegramDirectoryCache, readTelegramMessageCache } from './telegramCache';
import { TelegramFolder, BandwidthStats } from '../../types';
import { parseDate } from '../../utils';
import { TypingUserData, PresenceData } from '../../hooks/useRealtime';
import { GROUP_JOINED_EVENT, GroupJoinedEventDetail } from '../../events/groupEvents';

interface GroupInfo {
    id: number;
    name: string;
    username: string | null;
    member_count: number;
    top_members?: { user_id: string; first_name: string; last_name?: string | null; photo_url?: string | null }[];
    unread_count?: number;
    photo_url?: string | null;
}

interface ContactInfo {
    user_id: string;
    first_name: string;
    last_name?: string | null;
    username?: string | null;
    phone?: string | null;
    photo_url?: string | null;
    unread_count?: number;
}

interface CurrentUser {
    user_id: string;
    first_name: string;
    last_name?: string | null;
    username?: string | null;
    phone?: string | null;
    photo_url?: string | null;
}

interface CachedMessagePreview {
    text: string;
    date: string;
    sender_name: string;
    outgoing?: boolean;
    has_media: boolean;
    media_type: string;
    media_name: string;
    message_type?: string;
}

interface SidebarProps {
    folders: TelegramFolder[];
    activeFolderId: number | null;
    setActiveFolderId: (id: number | null) => void;
    activeGroupId: number | null;
    setActiveGroupId: (id: number | null) => void;
    activeDirectChatId: string | null;
    setActiveDirectChat: (contact: ContactInfo | null) => void;
    activeCompanyManagement: boolean;
    setActiveCompanyManagement: (active: boolean) => void;
    onDrop: (e: React.DragEvent, folderId: number | null) => void;
    onDelete: (id: number, name: string) => void;
    onRename: (id: number, currentName: string, newName: string) => void;
    onCreate: (name: string) => Promise<void>;
    isSyncing: boolean;
    isConnected: boolean;
    onSync: () => void;
    onLogout: () => void;
    bandwidth: BandwidthStats | null;
}

export function Sidebar({
    folders, activeFolderId, setActiveFolderId, activeGroupId, setActiveGroupId, activeDirectChatId, setActiveDirectChat, activeCompanyManagement, setActiveCompanyManagement, onDrop, onDelete, onRename, onCreate,
    isSyncing, isConnected, onSync, onLogout, bandwidth
}: SidebarProps) {
    const [showNewFolderInput, setShowNewFolderInput] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [driveExpanded, setDriveExpanded] = useState(true);
    const [teamsExpanded, setTeamsExpanded] = useState(true);
    const [directExpanded, setDirectExpanded] = useState(true);
    const [showVisibilitySettings, setShowVisibilitySettings] = useState(false);
    const [groups, setGroups] = useState<GroupInfo[]>([]);
    const [contacts, setContacts] = useState<ContactInfo[]>([]);
    const [streamToken, setStreamToken] = useState('');
    const [workspacePrefs, setWorkspacePrefs] = useState<WorkspacePrefs | null>(null);
    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
    const [teamsBeforeDate, setTeamsBeforeDate] = useState<number | null>(null);
    const [contactsBeforeDate, setContactsBeforeDate] = useState<number | null>(null);
    const [teamsHasMore, setTeamsHasMore] = useState(false);
    const [contactsHasMore, setContactsHasMore] = useState(false);
    const [teamsLoadingMore, setTeamsLoadingMore] = useState(false);
    const [contactsLoadingMore, setContactsLoadingMore] = useState(false);
    const [lastMessages, setLastMessages] = useState<Record<string, CachedMessagePreview | null>>({});
    const [typingPeers, setTypingPeers] = useState<Record<string, TypingUserData[]>>({});
    const [presenceData, setPresenceData] = useState<Record<string, PresenceData>>({});

    useEffect(() => {
        loadInitialDirectory();
        invoke<string>('cmd_get_stream_token').then(setStreamToken).catch(console.error);
        loadWorkspacePrefs().then(setWorkspacePrefs);
    }, []);

    // Refresh sidebar when a group is joined elsewhere (e.g. via invite link)
    useEffect(() => {
        const handler = (e: Event) => {
            const detail = (e as CustomEvent<GroupJoinedEventDetail>).detail;
            if (!detail?.groupId) return;

            // Add the group optimistically if not already present, then do a full refresh
            setGroups(prev => {
                const exists = prev.some(g => g.id === detail.groupId);
                if (exists) return prev;
                return [
                    {
                        id: detail.groupId,
                        name: detail.groupName,
                        username: null,
                        member_count: 0,
                        unread_count: 0,
                        photo_url: null,
                    },
                    ...prev,
                ];
            });

            // Refresh from Telegram to get accurate data
            invoke<{ teams: GroupInfo[] }>('cmd_get_teams')
                .then(resp => {
                    setGroups(resp.teams);
                    saveTelegramDirectoryCache(currentUser?.user_id || null, resp.teams, contacts);
                })
                .catch(console.error);
        };

        window.addEventListener(GROUP_JOINED_EVENT, handler);
        return () => window.removeEventListener(GROUP_JOINED_EVENT, handler);
    }, [contacts, currentUser]);

    const loadInitialDirectory = async () => {
        try {
            const user = await invoke<CurrentUser | null>('cmd_get_current_user');
            if (user) {
                console.log('yes');
            }
            setCurrentUser(user);

            const cached = readTelegramDirectoryCache<GroupInfo, ContactInfo>(user?.user_id || null);
            if (cached) {
                setGroups(cached.teams);
                setContacts(cached.contacts);
                setTeamsBeforeDate(null);
                setContactsBeforeDate(null);
                setTeamsHasMore(false);
                setContactsHasMore(false);
            }

            const [groupResp, contactResp] = await Promise.all([
                invoke<{ teams: GroupInfo[]; next_before_date: number | null; has_more: boolean }>('cmd_get_teams'),
                invoke<{ chats: ContactInfo[]; next_before_date: number | null; has_more: boolean }>('cmd_get_direct_chats'),
            ]);
            setGroups(groupResp.teams);
            setContacts(contactResp.chats);
            setTeamsBeforeDate(groupResp.next_before_date);
            setContactsBeforeDate(contactResp.next_before_date);
            setTeamsHasMore(groupResp.has_more);
            setContactsHasMore(contactResp.has_more);
            saveTelegramDirectoryCache(user?.user_id || null, groupResp.teams, contactResp.chats);
        } catch (e) {
            console.error('Failed to load Telegram directory:', e);
        }
    };

    const loadGroups = async () => {
        try {
            const resp = await invoke<{ teams: GroupInfo[]; next_before_date: number | null; has_more: boolean }>('cmd_get_teams');
            setGroups(resp.teams);
            setTeamsBeforeDate(resp.next_before_date);
            setTeamsHasMore(resp.has_more);
            saveTelegramDirectoryCache(currentUser?.user_id || null, resp.teams, contacts);
        } catch (e) {
            console.error('Failed to load groups:', e);
        }
    };

    const loadMoreGroups = async () => {
        if (!teamsHasMore || teamsLoadingMore) return;
        try {
            setTeamsLoadingMore(true);
            const resp = await invoke<{ teams: GroupInfo[]; next_before_date: number | null; has_more: boolean }>('cmd_get_teams', { beforeDate: teamsBeforeDate });
            setGroups(prev => [...prev, ...resp.teams]);
            setTeamsBeforeDate(resp.next_before_date);
            setTeamsHasMore(resp.has_more);
        } catch (e) {
            console.error('Failed to load more groups:', e);
        } finally {
            setTeamsLoadingMore(false);
        }
    };

    const loadMoreDirectChats = async () => {
        if (!contactsHasMore || contactsLoadingMore) return;
        try {
            setContactsLoadingMore(true);
            const resp = await invoke<{ chats: ContactInfo[]; next_before_date: number | null; has_more: boolean }>('cmd_get_direct_chats', { beforeDate: contactsBeforeDate });
            setContacts(prev => [...prev, ...resp.chats]);
            setContactsBeforeDate(resp.next_before_date);
            setContactsHasMore(resp.has_more);
        } catch (e) {
            console.error('Failed to load more direct chats:', e);
        } finally {
            setContactsLoadingMore(false);
        }
    };

    const submitCreate = async () => {
        if (!newFolderName.trim()) return;
        try {
            await onCreate(newFolderName);
            setNewFolderName("");
            setShowNewFolderInput(false);
        } catch {
            // handled by parent
        }
    }

    const handleCreateGroup = async () => {
        const name = prompt('Enter group name:');
        if (!name) return;
        try {
            await invoke('cmd_create_team', { name, description: null });
            loadGroups();
        } catch (e) {
            console.error('Failed to create group:', e);
        }
    };

    const handleLoadMoreTeams = async () => {
        if (!teamsHasMore || teamsLoadingMore) return;
        await loadMoreGroups();
    };

    const handleLoadMoreDirect = async () => {
        if (!contactsHasMore || contactsLoadingMore) return;
        await loadMoreDirectChats();
    };

    useEffect(() => {
        const msgs: Record<string, CachedMessagePreview | null> = {};
        for (const group of groups) {
            const key = String(group.id);
            const cached = readTelegramMessageCache<any>(key);
            if (cached && cached.messages.length > 0) {
                const last = cached.messages[cached.messages.length - 1];
                msgs[key] = {
                    text: last.text,
                    date: last.date,
                    sender_name: last.sender_name,
                    outgoing: last.outgoing,
                    has_media: last.has_media,
                    media_type: last.media_type,
                    media_name: last.media_name,
                    message_type: last.message_type,
                };
            } else {
                msgs[key] = null;
            }
        }
        for (const contact of contacts) {
            const key = String(contact.user_id);
            const cached = readTelegramMessageCache<any>(key);
            if (cached && cached.messages.length > 0) {
                const last = cached.messages[cached.messages.length - 1];
                msgs[key] = {
                    text: last.text,
                    date: last.date,
                    sender_name: last.sender_name,
                    outgoing: last.outgoing,
                    has_media: last.has_media,
                    media_type: last.media_type,
                    media_name: last.media_name,
                    message_type: last.message_type,
                };
            } else {
                msgs[key] = null;
            }
        }
        setLastMessages(prev => {
            const prevStr = JSON.stringify(prev);
            const nextStr = JSON.stringify(msgs);
            return prevStr === nextStr ? prev : msgs;
        });
    }, [groups, contacts]);

    useEffect(() => {
        if (!teamsExpanded && !directExpanded) return;
        if (groups.length === 0 && contacts.length === 0) return;

        const pollTyping = async () => {
            const peers: string[] = [];
            if (teamsExpanded) {
                for (const g of groups) {
                    if (!workspacePrefs || isGroupVisible(g.id, workspacePrefs)) peers.push(String(g.id));
                }
            }
            if (directExpanded) {
                for (const c of contacts) {
                    if (!workspacePrefs || isDMVisible(c.user_id, workspacePrefs)) peers.push(c.user_id);
                }
            }
            const batch = peers.slice(0, 30);
            if (batch.length === 0) return;
            const results = await Promise.allSettled(
                batch.map(peerId =>
                    invoke<TypingUserData[]>('cmd_get_typing_status', { teamId: Number(peerId) })
                )
            );
            const next: Record<string, TypingUserData[]> = {};
            for (let i = 0; i < batch.length; i++) {
                const r = results[i];
                if (r.status === 'fulfilled' && r.value && r.value.length > 0) {
                    next[batch[i]] = r.value;
                }
            }
            setTypingPeers(next);
        };

        pollTyping();
        const timer = setInterval(pollTyping, 10000);
        return () => clearInterval(timer);
    }, [groups, contacts, workspacePrefs, teamsExpanded, directExpanded]);

    // Poll presence for direct chats
    useEffect(() => {
        if (!directExpanded) return;
        const visible = workspacePrefs ? contacts.filter(c => isDMVisible(c.user_id, workspacePrefs)) : contacts;
        if (visible.length === 0) return;

        const pollPresence = async () => {
            const userIds = visible.map(c => Number(c.user_id)).filter(id => id > 0);
            if (userIds.length === 0) return;
            try {
                const result = await invoke<PresenceData[]>('cmd_get_user_presence', { userIds });
                if (result) {
                    setPresenceData(prev => {
                        const next = { ...prev };
                        for (const p of result) {
                            next[String(p.user_id)] = p;
                        }
                        return next;
                    });
                }
            } catch (e) {
                console.debug('Failed to fetch presence:', e);
            }
        };

        pollPresence();
        const timer = setInterval(pollPresence, 30000);
        return () => clearInterval(timer);
    }, [contacts, workspacePrefs, directExpanded]);

    const formatSidebarDate = (dateStr: string): string => {
        const parsed = parseDate(dateStr);
        if (Number.isNaN(parsed.getTime())) return '';
        const now = new Date();
        const diffMs = now.getTime() - parsed.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) {
            return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) {
            return parsed.toLocaleDateString([], { weekday: 'short' });
        }
        return parsed.toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            year: parsed.getFullYear() === now.getFullYear() ? undefined : 'numeric',
        });
    };

    const getMediaLabel = (msg: CachedMessagePreview): string | null => {
        if (!msg.has_media) return null;
        switch (msg.media_type) {
            case 'photo': case 'image': return 'Photo';
            case 'video': return 'Video';
            case 'audio': return 'Audio';
            case 'voice': return 'Voice message';
            case 'document': return msg.media_name || 'Document';
            case 'file': return msg.media_name || 'File';
            default: return msg.media_name || 'Media';
        }
    };

    const getMediaIcon = (msg: CachedMessagePreview): ReactNode | null => {
        if (!msg.has_media) return null;
        const cls = "w-[10px] h-[10px] inline-block align-middle shrink-0";
        switch (msg.media_type) {
            case 'photo': case 'image': return <ImageIcon className={cls} />;
            case 'video': return <Film className={cls} />;
            case 'audio': return <Music className={cls} />;
            case 'voice': return <Mic className={cls} />;
            default: return <File className={cls} />;
        }
    };

    const visibleGroups = workspacePrefs
        ? groups.filter(group => isGroupVisible(group.id, workspacePrefs))
        : groups;
    const visibleContacts = workspacePrefs
        ? contacts.filter(contact => isDMVisible(contact.user_id, workspacePrefs))
        : contacts;

    return (
        <aside className="w-64 bg-telegram-surface border-r border-telegram-border flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 flex items-center gap-3">
                {currentUser ? (
                    <>
                        <TelegramAvatar user={currentUser} token={streamToken} size="md" />
                        <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-telegram-text truncate">
                                {currentUser.first_name} {currentUser.last_name || ''}
                            </p>
                            {currentUser.username && (
                                <p className="text-xs text-telegram-subtext truncate">@{currentUser.username}</p>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <img src="/logo.png" className="w-8 h-8 rounded-full drop-shadow-lg" alt="Logo" />
                        <span className="font-bold text-lg text-telegram-text tracking-tight">TgGuild</span>
                    </>
                )}
            </div>

            <nav className="flex-1 px-2 py-4 space-y-6 overflow-y-auto min-h-0">
                <div>
                    <SidebarItem
                        icon={Building2}
                        label="Company Management"
                        active={activeCompanyManagement}
                        onClick={() => {
                            setActiveCompanyManagement(true);
                            setActiveFolderId(null);
                            setActiveGroupId(null);
                            setActiveDirectChat(null);
                        }}
                        onDrop={(e: React.DragEvent) => onDrop(e, null)}
                        folderId={null}
                    />
                </div>

                <div>
                    <div className="w-full px-3 mb-2 flex items-center justify-between group">
                        <button
                            onClick={() => setDriveExpanded(!driveExpanded)}
                            className="min-w-0 flex flex-1 items-center justify-between"
                        >
                            <div className="flex items-center gap-2 text-[10px] font-bold text-telegram-subtext uppercase tracking-[0.1em] group-hover:text-telegram-text transition-colors">
                                <HardDrive className="w-3 h-3" />
                                Drive
                            </div>
                            {driveExpanded ? <ChevronDown className="w-3 h-3 text-telegram-subtext" /> : <ChevronRight className="w-3 h-3 text-telegram-subtext" />}
                        </button>
                        <button
                            onClick={() => setShowVisibilitySettings(true)}
                            className="ml-2 rounded-md p-1 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text"
                            title="Choose visible drives"
                        >
                            <Settings className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <AnimatePresence initial={false}>
                        {driveExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden space-y-1"
                            >
                                <SidebarItem
                                    icon={LayoutGrid}
                                    label="Saved Messages"
                                    active={!activeCompanyManagement && activeFolderId === null && activeGroupId === null}
                                    onClick={() => {
                                        setActiveCompanyManagement(false);
                                        setActiveFolderId(null);
                                        setActiveGroupId(null);
                                        setActiveDirectChat(null);
                                    }}
                                    onDrop={(e: React.DragEvent) => onDrop(e, null)}
                                    folderId={null}
                                />
                                {folders.filter(f => !workspacePrefs || isDriveVisibleWs(f.id, workspacePrefs)).map(folder => (
                                    <SidebarItem
                                        key={folder.id}
                                        icon={Folder}
                                        label={folder.name}
                                        active={activeFolderId === folder.id}
                                        onClick={() => {
                                            setActiveCompanyManagement(false);
                                            setActiveFolderId(folder.id);
                                            setActiveGroupId(null);
                                            setActiveDirectChat(null);
                                        }}
                                        onDrop={(e: React.DragEvent) => onDrop(e, folder.id)}
                                        onDelete={() => onDelete(folder.id, folder.name)}
                                        onRename={(newName) => onRename(folder.id, folder.name, newName)}
                                        folderId={folder.id}
                                        memberCount={folder.member_count}
                                        topMembers={folder.top_members}
                                        />
                                ))}

                                <div className="pt-2">
                                    {showNewFolderInput ? (
                                        <div className="px-3 py-2">
                                            <input
                                                autoFocus
                                                type="text"
                                                className="w-full bg-telegram-hover rounded-lg px-3 py-2 text-sm text-telegram-text border border-telegram-border focus:outline-none focus:ring-1 focus:ring-telegram-primary"
                                                placeholder="Folder Name"
                                                value={newFolderName}
                                                onChange={e => setNewFolderName(e.target.value)}
                                                onKeyDown={e => e.key === 'Enter' && submitCreate()}
                                                onBlur={() => !newFolderName && setShowNewFolderInput(false)}
                                            />
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setShowNewFolderInput(true)}
                                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-all border border-dashed border-telegram-border/50 hover:border-telegram-border"
                                        >
                                            <Plus className="w-3 h-3" />
                                            New Folder
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div>
                    <div className="w-full px-3 mb-2 flex items-center justify-between group">
                        <button
                            onClick={() => setTeamsExpanded(!teamsExpanded)}
                            className="min-w-0 flex flex-1 items-center justify-between"
                        >
                            <div className="flex items-center gap-2 text-[10px] font-bold text-telegram-subtext uppercase tracking-[0.1em] group-hover:text-telegram-text transition-colors">
                                <Users className="w-3 h-3" />
                                Teams
                            </div>
                            {teamsExpanded ? <ChevronDown className="w-3 h-3 text-telegram-subtext" /> : <ChevronRight className="w-3 h-3 text-telegram-subtext" />}
                        </button>
                        <button
                            onClick={() => setShowVisibilitySettings(true)}
                            className="ml-2 rounded-md p-1 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text"
                            title="Choose visible teams"
                        >
                            <Settings className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    <AnimatePresence initial={false}>
                        {teamsExpanded && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden space-y-1"
                            >
                                {visibleGroups.map(group => {
                                    const sortedMembers = group.top_members
                                        ? [...group.top_members].sort((a, b) => a.first_name.localeCompare(b.first_name))
                                        : [];
                                    const peerKey = String(group.id);
                                    const typing = typingPeers[peerKey];
                                    const lastMsg = lastMessages[peerKey];
                                    const isTyping = typing?.length > 0;
                                    const timeStr = !isTyping && lastMsg?.date ? formatSidebarDate(lastMsg.date) : null;

                                    let preview: ReactNode = null;
                                    if (isTyping) {
                                        const first = typing![0];
                                        preview = typing!.length === 1
                                            ? `${first.user_name} is typing...`
                                            : `${first.user_name} and ${typing!.length - 1} others are typing...`;
                                    } else if (lastMsg) {
                                        if (lastMsg.message_type === 'system') {
                                            preview = 'System message';
                                        } else {
                                            const mediaLabel = getMediaLabel(lastMsg);
                                            const mediaIcon = getMediaIcon(lastMsg);
                                            const msgContent = mediaIcon ? (
                                                <span className="inline-flex items-center gap-1 align-middle">
                                                    <span className="text-telegram-subtext/60 shrink-0">{mediaIcon}</span>
                                                    <span className="truncate">{mediaLabel}</span>
                                                </span>
                                            ) : lastMsg.text;
                                            const prefix = lastMsg.outgoing ? 'You' : lastMsg.sender_name;
                                            preview = <span>{prefix}: {msgContent}</span>;
                                        }
                                    }

                                    return (
                                    <button
                                        key={group.id}
                                        onClick={() => {
                                            setActiveCompanyManagement(false);
                                            setActiveGroupId(group.id);
                                            setActiveDirectChat(null);
                                            setActiveFolderId(null);
                                        }}
                                        className={`w-full relative flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                            activeGroupId === group.id
                                                ? 'bg-telegram-primary/[0.07] text-telegram-text'
                                                : 'text-telegram-text hover:bg-telegram-hover'
                                        }`}
                                    >
                                        {activeGroupId === group.id && (
                                            <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-telegram-primary" />
                                        )}
                                        <TelegramAvatar
                                            user={{ user_id: group.id, first_name: group.name, photo_url: group.photo_url }}
                                            token={streamToken}
                                            size="sm"
                                        />
                                        <div className="flex-1 text-left min-w-0">
                                            <div className="flex items-baseline gap-2">
                                                <span className={`truncate text-xs font-medium leading-5 ${activeGroupId === group.id ? 'text-telegram-text' : ''}`}>{group.name}</span>
                                                {timeStr && (
                                                    <span className="text-[10px] text-telegram-subtext flex-shrink-0 ml-auto">{timeStr}</span>
                                                )}
                                            </div>
                                            {preview !== null && (
                                                <p className={`truncate text-[11px] leading-tight ${isTyping ? 'text-telegram-primary' : activeGroupId === group.id ? 'text-telegram-text/60' : 'text-telegram-subtext'}`}>
                                                    {preview}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 self-start mt-0.5">
                                            {Boolean(group.unread_count) && (
                                                <span className={`rounded-full ${activeGroupId === group.id ? 'h-2 w-2 bg-telegram-primary' : 'h-2 w-2 bg-telegram-primary'}`} title={`${group.unread_count} unread`} />
                                            )}
                                            {sortedMembers.length > 0 && (
                                                <MemberStack members={sortedMembers} size="sm" maxDisplay={3} />
                                            )}
                                        </div>
                                    </button>
                                    );
                                })}

                                {teamsHasMore && (
                                    <button
                                        onClick={handleLoadMoreTeams}
                                        disabled={teamsLoadingMore}
                                        className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-telegram-primary hover:bg-telegram-primary/10 transition-colors disabled:opacity-50"
                                    >
                                        {teamsLoadingMore ? 'Loading...' : 'Load More Teams'}
                                    </button>
                                )}
                                {currentUser && (
                                    <div className="flex gap-2 pt-2">
                                        <button
                                            onClick={handleCreateGroup}
                                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-all border border-dashed border-telegram-border/50"
                                        >
                                            <Plus className="w-3 h-3" />
                                            New
                                        </button>
                                    </div>
                                )}

                                <div className="pt-3">
                                    <button
                                        onClick={() => setDirectExpanded(!directExpanded)}
                                        className="mb-1 flex w-full items-center justify-between px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-telegram-subtext hover:text-telegram-text"
                                    >
                                        <span>One on One</span>
                                        {directExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    </button>
                                    {directExpanded && visibleContacts.map(contact => {
                                        const peerKey = String(contact.user_id);
                                        const typing = typingPeers[peerKey];
                                        const lastMsg = lastMessages[peerKey];
                                        const isTyping = typing?.length > 0;
                                        const timeStr = !isTyping && lastMsg?.date ? formatSidebarDate(lastMsg.date) : null;

                                        let preview: ReactNode = null;
                                        if (isTyping) {
                                            const first = typing![0];
                                            preview = `${first.user_name} is typing...`;
                                        } else if (lastMsg) {
                                            const mediaLabel = getMediaLabel(lastMsg);
                                            const mediaIcon = getMediaIcon(lastMsg);
                                            const msgContent = mediaIcon ? (
                                                <span className="inline-flex items-center gap-1 align-middle">
                                                    <span className="text-telegram-subtext/60 shrink-0">{mediaIcon}</span>
                                                    <span className="truncate">{mediaLabel}</span>
                                                </span>
                                            ) : lastMsg.text;
                                            preview = lastMsg.outgoing ? <span>You: {msgContent}</span> : msgContent;
                                        }

                                        return (
                                        <button
                                            key={contact.user_id}
                                            onClick={() => {
                                                setActiveCompanyManagement(false);
                                                setActiveGroupId(null);
                                                setActiveFolderId(null);
                                                setActiveDirectChat(contact);
                                            }}
                                            className={`flex w-full relative items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                                                activeDirectChatId === contact.user_id
                                                    ? 'bg-telegram-primary/[0.07] text-telegram-text'
                                                    : 'text-telegram-text hover:bg-telegram-hover'
                                            }`}
                                        >
                                            {activeDirectChatId === contact.user_id && (
                                                <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-telegram-primary" />
                                            )}
                                            <div className="relative flex-shrink-0">
                                                <TelegramAvatar user={contact} token={streamToken} size="sm" />
                                                {presenceData[String(contact.user_id)]?.online && (
                                                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-telegram-surface shadow-[0_0_4px_rgba(34,197,94,0.5)]" />
                                                )}
                                            </div>
                                            <div className="flex-1 text-left min-w-0">
                                                <div className="flex items-baseline gap-2">
                                                    <span className="truncate text-xs font-medium leading-5">
                                                        {contact.first_name} {contact.last_name || ''}
                                                    </span>
                                                    {timeStr && (
                                                        <span className="text-[10px] text-telegram-subtext flex-shrink-0 ml-auto">{timeStr}</span>
                                                    )}
                                                </div>
                                                {preview !== null && (
                                                    <p className={`truncate text-[11px] leading-tight ${isTyping ? 'text-telegram-primary' : activeDirectChatId === contact.user_id ? 'text-telegram-text/60' : 'text-telegram-subtext'}`}>
                                                        {preview}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 self-start mt-0.5">
                                                {Boolean(contact.unread_count) && (
                                                    <span className="h-2 w-2 rounded-full bg-telegram-primary" title={`${contact.unread_count} unread`} />
                                                )}
                                            </div>
                                        </button>
                                        );
                                    })}
                                    {contactsHasMore && (
                                        <button
                                            onClick={handleLoadMoreDirect}
                                            disabled={contactsLoadingMore}
                                            className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-telegram-primary hover:bg-telegram-primary/10 transition-colors disabled:opacity-50"
                                        >
                                            {contactsLoadingMore ? 'Loading...' : 'Load More Contacts'}
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </nav>

            <div className="p-4 border-t border-telegram-border">
                <div className="flex items-center gap-2 text-telegram-subtext text-[10px] font-medium">
                    <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`}></div>
                    <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>

                <div className="flex gap-2 mt-4">
                    <button
                        onClick={onSync}
                        disabled={isSyncing}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-all ${isSyncing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                        Sync
                    </button>
                    <button
                        onClick={onLogout}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-all"
                    >
                        <LogOut className="w-3 h-3" />
                        Exit
                    </button>
                </div>

                {bandwidth && <BandwidthWidget bandwidth={bandwidth} />}
            </div>

            {showVisibilitySettings && workspacePrefs && (
                <WorkspaceVisibilityModal
                    teams={groups}
                    contacts={contacts}
                    drives={folders.map(f => ({ id: f.id, name: f.name, username: null, member_count: f.member_count ?? 0 }))}
                    prefs={workspacePrefs}
                    streamToken={streamToken}
                    mode="settings"
                    onClose={() => setShowVisibilitySettings(false)}
                    onSave={(prefs) => {
                        setWorkspacePrefs(prefs);
                        saveWorkspacePrefs(prefs);
                        setShowVisibilitySettings(false);
                    }}
                />
            )}
        </aside>
    )
}
