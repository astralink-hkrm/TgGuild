import { useState, useEffect } from 'react';
import { Search, UserPlus, X, Loader2, UserMinus, Users, Contact } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { TelegramAvatar } from './TelegramAvatar';

interface TeamMember {
    user_id: string;
    first_name: string;
    last_name?: string | null;
    username?: string | null;
    phone?: string | null;
    photo_url?: string | null;
    is_owner?: boolean;
    is_admin?: boolean;
    role?: string;
    access_hash?: string; // Added to help with invitations
    invite_eligible?: boolean;
    invite_restriction?: string | null;
}

interface AddSubscriberModalProps {
    teamId: number;
    canManageMembers?: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export function AddSubscriberModal({ teamId, canManageMembers = true, onClose, onSuccess }: AddSubscriberModalProps) {
    const [activeTab, setActiveTab] = useState<'members' | 'contacts'>('members');
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState<TeamMember[]>([]);
    const [contacts, setContacts] = useState<TeamMember[]>([]);
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [membersLoading, setMembersLoading] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isAdding, setIsAdding] = useState<string | null>(null);
    const [isSendingInvite, setIsSendingInvite] = useState<string | null>(null);
    const [isRemoving, setIsRemoving] = useState<string | null>(null);
    const [streamToken, setStreamToken] = useState<string>('');

    useEffect(() => {
        loadMembers();
        loadContacts();
        invoke<string>('cmd_get_stream_token').then(setStreamToken).catch(console.error);
    }, []);

    useEffect(() => {
        if (activeTab === 'contacts' && searchTerm.length >= 2) {
            handleSearch(searchTerm);
        }
    }, [activeTab]);

    const loadMembers = async () => {
        try {
            setMembersLoading(true);
            const res = await invoke<TeamMember[]>('cmd_get_team_members', { teamId });
            setMembers(res);
        } catch (e) {
            console.error('Failed to load members:', e);
        } finally {
            setMembersLoading(false);
        }
    };

    const loadContacts = async () => {
        try {
            const [directResp, telegramContacts] = await Promise.all([
                invoke<{ chats: TeamMember[] }>('cmd_get_direct_chats'),
                invoke<TeamMember[]>('cmd_get_contacts').catch(() => [] as TeamMember[]),
            ]);
            setContacts(mergePeople(directResp.chats, telegramContacts));
        } catch (e) {
            console.error('Failed to load contacts:', e);
        }
    };

    const handleSearch = async (term: string) => {
        setSearchTerm(term);
        if (term.length < 2 || activeTab === 'members') {
            setResults([]);
            return;
        }

        setIsLoading(true);
        try {
            const res = await invoke<TeamMember[]>('cmd_search_users', { query: term });
            setResults(res);
        } catch (e) {
            console.error('Search failed:', e);
        } finally {
            setIsLoading(false);
        }
    };

    const isExistingMember = (userId: string) => members.some(member => member.user_id === userId);

    const handleAdd = async (member: TeamMember) => {
        if (isExistingMember(member.user_id)) return;
        if (member.invite_eligible === false) {
            await handleSendInviteLink(member);
            return;
        }
        setIsAdding(member.user_id);
        try {
            await invoke('cmd_add_team_member', { 
                teamId, 
                userIdStr: member.user_id,
                accessHashStr: member.access_hash
            });
            toast.success(`Successfully invited ${member.first_name}`);
            await loadMembers();
            onSuccess?.();
        } catch (e) {
            toast.error(`Failed to add: ${e}`);
        } finally {
            setIsAdding(null);
        }
    };

    const handleSendInviteLink = async (member: TeamMember) => {
        setIsSendingInvite(member.user_id);
        try {
            await invoke('cmd_send_team_invite_link', {
                teamId,
                userIdStr: member.user_id,
                accessHashStr: member.access_hash,
            });
            toast.success(`Invite link sent to ${member.first_name}`);
        } catch (e) {
            toast.error(`Failed to send invite link: ${e}`);
        } finally {
            setIsSendingInvite(null);
        }
    };

    const handleRemove = async (member: TeamMember) => {
        setIsRemoving(member.user_id);
        try {
            await invoke('cmd_remove_team_member', {
                teamId,
                userIdStr: member.user_id,
                accessHashStr: member.access_hash,
            });
            toast.success(`Removed ${member.first_name}`);
            await loadMembers();
            onSuccess?.();
        } catch (e) {
            toast.error(`Failed to remove: ${e}`);
        } finally {
            setIsRemoving(null);
        }
    };

    const filteredMembers = members.filter(member => {
        const haystack = `${member.first_name} ${member.last_name || ''} ${member.username || ''} ${member.phone || ''}`.toLowerCase();
        return haystack.includes(searchTerm.toLowerCase());
    });

    const displayContacts = searchTerm.length >= 2 ? mergePeople(results, contacts) : contacts;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4" onClick={onClose}>
            <div className="bg-telegram-surface border border-telegram-border rounded-xl w-full max-w-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b border-telegram-border flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-telegram-text">Team Members</h3>
                        <p className="text-xs text-telegram-subtext">{members.length} current members</p>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-telegram-hover rounded-full transition-colors">
                        <X className="w-5 h-5 text-telegram-subtext" />
                    </button>
                </div>

                <div className="p-4">
                    <div className="grid grid-cols-2 gap-2 mb-4 rounded-lg bg-telegram-hover p-1">
                        <button
                            onClick={() => setActiveTab('members')}
                            className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${activeTab === 'members' ? 'bg-telegram-surface text-telegram-text shadow-sm' : 'text-telegram-subtext hover:text-telegram-text'}`}
                        >
                            <Users className="w-4 h-4" />
                            Members
                        </button>
                        {canManageMembers ? (
                            <button
                                onClick={() => setActiveTab('contacts')}
                                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${activeTab === 'contacts' ? 'bg-telegram-surface text-telegram-text shadow-sm' : 'text-telegram-subtext hover:text-telegram-text'}`}
                            >
                            <Contact className="w-4 h-4" />
                            People
                            </button>
                        ) : (
                            <button
                                className="flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm text-telegram-subtext opacity-60"
                                disabled
                            >
                                <Contact className="w-4 h-4" />
                                People
                            </button>
                        )}
                    </div>

                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-telegram-subtext" />
                        <input
                            autoFocus
                            type="text"
                            placeholder={activeTab === 'members' ? 'Search current members...' : 'Search people or @username...'}
                            className="w-full bg-telegram-hover border border-telegram-border rounded-xl pl-10 pr-4 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/50 transition-colors"
                            value={searchTerm}
                            onChange={(e) => handleSearch(e.target.value)}
                        />
                        {isLoading && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <Loader2 className="w-4 h-4 text-telegram-primary animate-spin" />
                            </div>
                        )}
                    </div>

                    <div className="max-h-[300px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                        {activeTab === 'members' ? (
                            membersLoading ? (
                                <div className="py-8 text-center text-sm text-telegram-subtext">Loading members...</div>
                            ) : filteredMembers.length > 0 ? (
                                filteredMembers.map(member => (
                                    <div key={member.user_id} className="flex items-center gap-3 p-2 hover:bg-telegram-hover rounded-xl transition-colors group">
                                        <TelegramAvatar user={member} token={streamToken} size="lg" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-telegram-text truncate">
                                                {member.first_name} {member.last_name || ''}
                                            </p>
                                            <p className="text-xs text-telegram-subtext truncate">
                                                {member.username ? `@${member.username}` : member.phone || member.role || 'Member'}
                                            </p>
                                        </div>
                                        {canManageMembers && !member.is_owner && (
                                            <button
                                                onClick={() => handleRemove(member)}
                                                disabled={isRemoving !== null}
                                                className="p-2 hover:bg-red-500/10 text-red-400 rounded-lg transition-all disabled:opacity-50"
                                                title="Remove member"
                                            >
                                                {isRemoving === member.user_id ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <UserMinus className="w-4 h-4" />
                                                )}
                                            </button>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="py-8 text-center text-sm text-telegram-subtext">No members found</div>
                            )
                        ) : canManageMembers && displayContacts.length > 0 ? (
                            displayContacts.map(member => {
                                const alreadyAdded = isExistingMember(member.user_id);
                                const inviteBlocked = member.invite_eligible === false;
                                return (
                                <div key={member.user_id} className="flex items-center gap-3 p-2 hover:bg-telegram-hover rounded-xl transition-colors group">
                                    <TelegramAvatar user={member} token={streamToken} size="lg" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-telegram-text truncate">
                                            {member.first_name} {member.last_name || ''}
                                        </p>
                                        <p className="text-xs text-telegram-subtext truncate">
                                            {inviteBlocked ? 'Invite link required' : member.username ? `@${member.username}` : member.phone || 'No username'}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleAdd(member)}
                                        disabled={isAdding !== null || isSendingInvite !== null || alreadyAdded}
                                        className="p-2 bg-telegram-primary/10 hover:bg-telegram-primary text-telegram-primary hover:text-white rounded-lg transition-all disabled:cursor-not-allowed disabled:opacity-40"
                                        title={alreadyAdded ? 'Already a member' : inviteBlocked ? 'Send invite link' : 'Add member'}
                                    >
                                        {isAdding === member.user_id || isSendingInvite === member.user_id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <UserPlus className="w-4 h-4" />
                                        )}
                                    </button>
                                </div>
                            )})
                        ) : (
                            <div className="py-8 text-center">
                                <p className="text-sm text-telegram-subtext">
                                    {searchTerm.length >= 2 ? 'No results found' : 'No people found'}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-telegram-hover/50 text-center">
                    <p className="text-[10px] text-telegram-subtext uppercase tracking-wider font-bold">
                        Search people by name, phone, or @username
                    </p>
                </div>
            </div>
        </div>
    );
}

function mergePeople(primary: TeamMember[], secondary: TeamMember[]) {
    const peopleById = new Map<string, TeamMember>();
    [...primary, ...secondary].forEach(person => {
        const key = String(person.user_id);
        const existing = peopleById.get(key);
        peopleById.set(key, {
            ...person,
            ...existing,
            access_hash: existing?.access_hash || person.access_hash,
            username: existing?.username || person.username,
            phone: existing?.phone || person.phone,
            invite_eligible: existing?.invite_eligible === true || person.invite_eligible === true
                ? true
                : existing?.invite_eligible ?? person.invite_eligible,
            invite_restriction: existing?.invite_eligible === true || person.invite_eligible === true
                ? null
                : existing?.invite_restriction || person.invite_restriction,
        });
    });
    return Array.from(peopleById.values());
}
