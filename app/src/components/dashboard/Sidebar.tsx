import { useState, useEffect } from 'react';
import { Building2, HardDrive, Folder, Plus, RefreshCw, LogOut, Users, LayoutGrid, ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { invoke } from '@tauri-apps/api/core';
import { SidebarItem } from './SidebarItem';
import { BandwidthWidget } from './BandwidthWidget';
import { MemberStack } from './MemberStack';
import { TelegramAvatar } from './TelegramAvatar';
import { TeamVisibilityModal } from './TeamVisibilityModal';
import {
    isContactVisible,
    isTeamVisible,
    readTeamVisibility,
    TEAM_VISIBILITY_CHANGED_EVENT,
    TeamVisibilitySettings,
} from './teamVisibility';
import { readTelegramDirectoryCache, saveTelegramDirectoryCache } from './telegramCache';
import { TelegramFolder, BandwidthStats } from '../../types';

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
    const [teamVisibility, setTeamVisibility] = useState<TeamVisibilitySettings>(() => readTeamVisibility());
    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
    const [teamsBeforeDate, setTeamsBeforeDate] = useState<number | null>(null);
    const [contactsBeforeDate, setContactsBeforeDate] = useState<number | null>(null);
    const [teamsHasMore, setTeamsHasMore] = useState(false);
    const [contactsHasMore, setContactsHasMore] = useState(false);
    const [teamsLoadingMore, setTeamsLoadingMore] = useState(false);
    const [contactsLoadingMore, setContactsLoadingMore] = useState(false);

    useEffect(() => {
        loadInitialDirectory();
        invoke<string>('cmd_get_stream_token').then(setStreamToken).catch(console.error);
    }, []);

    useEffect(() => {
        const handleVisibilityChange = () => setTeamVisibility(readTeamVisibility());
        window.addEventListener(TEAM_VISIBILITY_CHANGED_EVENT, handleVisibilityChange);
        window.addEventListener('storage', handleVisibilityChange);
        return () => {
            window.removeEventListener(TEAM_VISIBILITY_CHANGED_EVENT, handleVisibilityChange);
            window.removeEventListener('storage', handleVisibilityChange);
        };
    }, []);

    const loadInitialDirectory = async () => {
        try {
            const user = await invoke<CurrentUser | null>('cmd_get_current_user');
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

    const visibleGroups = groups.filter(group => isTeamVisible(group.id, teamVisibility));
    const visibleContacts = contacts.filter(contact => isContactVisible(contact.user_id, teamVisibility));

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
                    <button
                        onClick={() => setDriveExpanded(!driveExpanded)}
                        className="w-full px-3 mb-2 flex items-center justify-between group"
                    >
                        <div className="flex items-center gap-2 text-[10px] font-bold text-telegram-subtext uppercase tracking-[0.1em] group-hover:text-telegram-text transition-colors">
                            <HardDrive className="w-3 h-3" />
                            Drive
                        </div>
                        {driveExpanded ? <ChevronDown className="w-3 h-3 text-telegram-subtext" /> : <ChevronRight className="w-3 h-3 text-telegram-subtext" />}
                    </button>

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
                                {folders.map(folder => (
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
                                                className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white border border-telegram-border focus:outline-none focus:ring-1 focus:ring-telegram-primary"
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
                                    return (
                                    <button
                                        key={group.id}
                                        onClick={() => {
                                            setActiveCompanyManagement(false);
                                            setActiveGroupId(group.id);
                                            setActiveDirectChat(null);
                                            setActiveFolderId(null);
                                        }}
                                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                                            activeGroupId === group.id
                                                ? 'bg-telegram-primary/10 text-telegram-primary border border-telegram-primary/20'
                                                : 'text-telegram-text hover:bg-telegram-hover'
                                        }`}
                                    >
                                        <TelegramAvatar
                                            user={{ user_id: group.id, first_name: group.name, photo_url: group.photo_url }}
                                            token={streamToken}
                                            size="sm"
                                        />
                                        <div className="flex-1 text-left min-w-0">
                                            <p className="truncate">{group.name}</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {Boolean(group.unread_count) && (
                                                <span className="h-2 w-2 rounded-full bg-telegram-primary" title={`${group.unread_count} unread`} />
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
                                <div className="flex gap-2 pt-2">
                                    <button
                                        onClick={handleCreateGroup}
                                        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-all border border-dashed border-telegram-border/50"
                                    >
                                        <Plus className="w-3 h-3" />
                                        New
                                    </button>
                                </div>

                                <div className="pt-3">
                                    <button
                                        onClick={() => setDirectExpanded(!directExpanded)}
                                        className="mb-1 flex w-full items-center justify-between px-3 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-telegram-subtext hover:text-telegram-text"
                                    >
                                        <span>One on One</span>
                                        {directExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    </button>
                                    {directExpanded && visibleContacts.map(contact => (
                                        <button
                                            key={contact.user_id}
                                            onClick={() => {
                                                setActiveCompanyManagement(false);
                                                setActiveGroupId(null);
                                                setActiveFolderId(null);
                                                setActiveDirectChat(contact);
                                            }}
                                            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                                                activeDirectChatId === contact.user_id
                                                    ? 'bg-telegram-primary/10 text-telegram-primary border border-telegram-primary/20'
                                                    : 'text-telegram-text hover:bg-telegram-hover'
                                            }`}
                                        >
                                            <TelegramAvatar user={contact} token={streamToken} size="sm" />
                                            <span className="min-w-0 flex-1 truncate text-left">
                                                {contact.first_name} {contact.last_name || ''}
                                            </span>
                                            {Boolean(contact.unread_count) && (
                                                <span className="h-2 w-2 rounded-full bg-telegram-primary" title={`${contact.unread_count} unread`} />
                                            )}
                                        </button>
                                    ))}
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

            {showVisibilitySettings && (
                <TeamVisibilityModal
                    teams={groups}
                    contacts={contacts}
                    settings={teamVisibility}
                    streamToken={streamToken}
                    onClose={() => setShowVisibilitySettings(false)}
                    onChange={setTeamVisibility}
                />
            )}
        </aside>
    )
}
