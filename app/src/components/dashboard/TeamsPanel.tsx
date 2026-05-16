import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Plus, Search, Settings, UserMinus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { AddSubscriberModal } from './AddSubscriberModal';
import { TeamChat } from './TeamChat';
import { TelegramAvatar } from './TelegramAvatar';
import { TeamVisibilityModal } from './TeamVisibilityModal';
import {
    isContactVisible,
    isTeamVisible,
    readTeamVisibility,
    TEAM_VISIBILITY_CHANGED_EVENT,
    TeamVisibilitySettings,
} from './teamVisibility';

interface TeamInfo {
    id: number;
    name: string;
    username: string | null;
    member_count: number;
    is_channel: boolean;
    is_supergroup: boolean;
}

interface TeamMember {
    user_id: string;
    first_name: string;
    last_name: string | null;
    username: string | null;
    phone: string | null;
    is_admin: boolean;
    is_owner: boolean;
    role: string;
    access_hash?: string | null;
    unread_count?: number;
}

interface CurrentTelegramUser {
    user_id: string;
}

interface TeamsPanelProps {
    onGroupCreated?: () => void;
}

type SelectedChat =
    | { type: 'group'; team: TeamInfo }
    | { type: 'direct'; contact: TeamMember };

export function TeamsPanel({ onGroupCreated }: TeamsPanelProps) {
    const [teams, setTeams] = useState<TeamInfo[]>([]);
    const [contacts, setContacts] = useState<TeamMember[]>([]);
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);
    const [loading, setLoading] = useState(true);
    const [membersLoading, setMembersLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [streamToken, setStreamToken] = useState('');
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showMembersPanel, setShowMembersPanel] = useState(true);
    const [showAddMemberModal, setShowAddMemberModal] = useState(false);
    const [showVisibilitySettings, setShowVisibilitySettings] = useState(false);
    const [teamVisibility, setTeamVisibility] = useState<TeamVisibilitySettings>(() => readTeamVisibility());
    const [newTeamName, setNewTeamName] = useState('');
    const [newTeamDesc, setNewTeamDesc] = useState('');

    useEffect(() => {
        loadInitialData();
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

    useEffect(() => {
        if (!selectedChat) return;

        if (selectedChat.type === 'group' && !isTeamVisible(selectedChat.team.id, teamVisibility)) {
            const nextTeam = teams.find(team => isTeamVisible(team.id, teamVisibility));
            if (nextTeam) {
                selectGroup(nextTeam);
            } else {
                setSelectedChat(null);
                setMembers([]);
            }
        }

        if (selectedChat.type === 'direct' && !isContactVisible(selectedChat.contact.user_id, teamVisibility)) {
            const nextContact = contacts.find(contact => isContactVisible(contact.user_id, teamVisibility));
            if (nextContact) {
                selectContact(nextContact);
            } else {
                setSelectedChat(null);
            }
        }
    }, [teamVisibility, teams, contacts, selectedChat]);

    const selectedTeam = selectedChat?.type === 'group' ? selectedChat.team : null;
    const selectedContact = selectedChat?.type === 'direct' ? selectedChat.contact : null;

    const canManageMembers = useMemo(() => {
        if (!selectedTeam || !currentUserId) return false;
        return members.some(member => String(member.user_id) === currentUserId && (member.is_admin || member.is_owner));
    }, [members, currentUserId, selectedTeam]);

    const loadInitialData = async () => {
        try {
            setLoading(true);
            const [teamResult, contactResult, userResult, token] = await Promise.all([
                invoke<TeamInfo[]>('cmd_get_teams'),
                invoke<TeamMember[]>('cmd_get_direct_chats'),
                invoke<CurrentTelegramUser | null>('cmd_get_current_user'),
                invoke<string>('cmd_get_stream_token'),
            ]);
            setTeams(teamResult);
            setContacts(contactResult);
            setCurrentUserId(userResult?.user_id || null);
            setStreamToken(token);
            const visibleTeam = teamResult.find(team => isTeamVisible(team.id, teamVisibility));
            if (!selectedChat && visibleTeam) {
                selectGroup(visibleTeam);
            }
        } catch (e) {
            toast.error(`Failed to load teams: ${e}`);
        } finally {
            setLoading(false);
        }
    };

    const loadTeams = async () => {
        const result = await invoke<TeamInfo[]>('cmd_get_teams');
        setTeams(result);
        return result;
    };

    const loadMembers = async (teamId: number) => {
        try {
            setMembersLoading(true);
            const result = await invoke<TeamMember[]>('cmd_get_team_members', { teamId });
            setMembers(result);
        } catch (e) {
            toast.error(`Failed to load members: ${e}`);
        } finally {
            setMembersLoading(false);
        }
    };

    const selectGroup = (team: TeamInfo) => {
        setSelectedChat({ type: 'group', team });
        setShowMembersPanel(true);
        loadMembers(team.id);
    };

    const selectContact = (contact: TeamMember) => {
        setSelectedChat({ type: 'direct', contact });
        setMembers([]);
        setShowMembersPanel(false);
    };

    const handleCreateTeam = async () => {
        if (!newTeamName.trim()) {
            toast.error('Team name is required');
            return;
        }
        try {
            await invoke('cmd_create_team', { name: newTeamName.trim(), description: newTeamDesc || null });
            toast.success('Team created');
            setShowCreateModal(false);
            setNewTeamName('');
            setNewTeamDesc('');
            const refreshed = await loadTeams();
            onGroupCreated?.();
            if (refreshed.length > 0) selectGroup(refreshed[0]);
        } catch (e) {
            toast.error(`Failed to create team: ${e}`);
        }
    };

    const handleEditTeam = async () => {
        if (!selectedTeam || !newTeamName.trim()) return;
        try {
            await invoke('cmd_edit_team', {
                teamId: selectedTeam.id,
                newName: newTeamName.trim(),
                newDescription: newTeamDesc || null,
            });
            toast.success('Team updated');
            setShowEditModal(false);
            const refreshed = await loadTeams();
            const updated = refreshed.find(team => team.id === selectedTeam.id);
            if (updated) setSelectedChat({ type: 'group', team: updated });
        } catch (e) {
            toast.error(`Failed to update team: ${e}`);
        }
    };

    const handleDeleteTeam = async () => {
        if (!selectedTeam || !confirm('Are you sure you want to delete this team?')) return;
        try {
            await invoke('cmd_delete_team', { teamId: selectedTeam.id });
            toast.success('Team deleted');
            setSelectedChat(null);
            setMembers([]);
            await loadTeams();
            onGroupCreated?.();
        } catch (e) {
            toast.error(`Failed to delete team: ${e}`);
        }
    };

    const handleRemoveMember = async (member: TeamMember) => {
        if (!selectedTeam || !canManageMembers) return;
        try {
            await invoke('cmd_remove_team_member', {
                teamId: selectedTeam.id,
                userIdStr: member.user_id,
                accessHashStr: member.access_hash,
            });
            toast.success('Member removed');
            loadMembers(selectedTeam.id);
        } catch (e) {
            toast.error(`Failed to remove member: ${e}`);
        }
    };

    const filteredTeams = teams.filter(team => {
        const text = `${team.name} ${team.username || ''}`.toLowerCase();
        return isTeamVisible(team.id, teamVisibility) && text.includes(searchTerm.toLowerCase());
    });

    const filteredContacts = contacts.filter(contact => {
        const text = `${contact.first_name} ${contact.last_name || ''} ${contact.username || ''} ${contact.phone || ''}`.toLowerCase();
        return isContactVisible(contact.user_id, teamVisibility) && text.includes(searchTerm.toLowerCase());
    });

    return (
        <div className="flex h-full bg-telegram-bg">
            <aside className="w-80 flex-shrink-0 border-r border-telegram-border bg-telegram-surface flex flex-col">
                <div className="h-16 px-4 border-b border-telegram-border flex items-center gap-3">
                    <div className="flex-1">
                        <h2 className="text-base font-semibold text-telegram-text">Teams</h2>
                        <p className="text-xs text-telegram-subtext">Groups and direct chats</p>
                    </div>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="p-2 rounded-full bg-telegram-primary text-white hover:bg-telegram-primary/90 transition-colors"
                        title="New group"
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setShowVisibilitySettings(true)}
                        className="p-2 rounded-full text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors"
                        title="Choose visible teams"
                    >
                        <Settings className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-telegram-subtext" />
                        <input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search"
                            className="w-full rounded-xl bg-telegram-hover border border-telegram-border py-2 pl-9 pr-3 text-sm text-telegram-text outline-none focus:border-telegram-primary"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-3">
                    <SectionLabel label="Groups" />
                    {loading ? (
                        <p className="px-3 py-4 text-sm text-telegram-subtext">Loading...</p>
                    ) : filteredTeams.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-telegram-subtext">No groups found</p>
                    ) : (
                        filteredTeams.map(team => (
                            <button
                                key={team.id}
                                onClick={() => selectGroup(team)}
                                className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                                    selectedTeam?.id === team.id
                                        ? 'bg-telegram-primary/15 text-telegram-text'
                                        : 'hover:bg-telegram-hover text-telegram-text'
                                }`}
                            >
                                <div className="w-11 h-11 rounded-full bg-telegram-primary/15 text-telegram-primary flex items-center justify-center">
                                    <Users className="w-5 h-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium">{team.name}</p>
                                    <p className="truncate text-xs text-telegram-subtext">
                                        {team.member_count} members{team.username ? ` • @${team.username}` : ''}
                                    </p>
                                </div>
                            </button>
                        ))
                    )}

                    <SectionLabel label="Direct Messages" />
                    {filteredContacts.map(contact => (
                        <button
                            key={contact.user_id}
                            onClick={() => selectContact(contact)}
                            className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                                selectedContact?.user_id === contact.user_id
                                    ? 'bg-telegram-primary/15 text-telegram-text'
                                    : 'hover:bg-telegram-hover text-telegram-text'
                            }`}
                        >
                            <TelegramAvatar user={contact} token={streamToken} size="lg" />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{contact.first_name} {contact.last_name || ''}</p>
                                <p className="truncate text-xs text-telegram-subtext">
                                    {contact.username ? `@${contact.username}` : contact.phone || 'Telegram contact'}
                                </p>
                            </div>
                        </button>
                    ))}
                </div>
            </aside>

            <main className="min-w-0 flex-1 flex">
                {selectedChat ? (
                    <>
                        <TeamChat
                            groupId={selectedTeam ? selectedTeam.id : Number(selectedContact!.user_id)}
                            groupName={selectedTeam ? selectedTeam.name : `${selectedContact!.first_name} ${selectedContact!.last_name || ''}`.trim()}
                            memberCount={selectedTeam?.member_count || members.length}
                            canManageMembers={canManageMembers}
                            isDirect={selectedChat.type === 'direct'}
                            mentionableMembers={members}
                            onManageMembers={() => setShowAddMemberModal(true)}
                        />
                        {selectedTeam && showMembersPanel && (
                            <MembersDrawer
                                members={members}
                                membersLoading={membersLoading}
                                canManageMembers={canManageMembers}
                                streamToken={streamToken}
                                onClose={() => setShowMembersPanel(false)}
                                onAdd={() => setShowAddMemberModal(true)}
                                onEdit={() => {
                                    if (!selectedTeam || !canManageMembers) return;
                                    setNewTeamName(selectedTeam.name);
                                    setNewTeamDesc('');
                                    setShowEditModal(true);
                                }}
                                onDelete={handleDeleteTeam}
                                onRemove={handleRemoveMember}
                            />
                        )}
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-sm text-telegram-subtext">
                        Select a conversation
                    </div>
                )}
            </main>

            {showCreateModal && (
                <TeamFormModal
                    title="Create Group"
                    name={newTeamName}
                    description={newTeamDesc}
                    onNameChange={setNewTeamName}
                    onDescriptionChange={setNewTeamDesc}
                    onClose={() => setShowCreateModal(false)}
                    onSubmit={handleCreateTeam}
                    submitLabel="Create"
                />
            )}

            {showEditModal && (
                <TeamFormModal
                    title="Edit Group"
                    name={newTeamName}
                    description={newTeamDesc}
                    onNameChange={setNewTeamName}
                    onDescriptionChange={setNewTeamDesc}
                    onClose={() => setShowEditModal(false)}
                    onSubmit={handleEditTeam}
                    submitLabel="Save"
                />
            )}

            {showAddMemberModal && selectedTeam && (
                <AddSubscriberModal
                    teamId={selectedTeam.id}
                    canManageMembers={canManageMembers}
                    onClose={() => setShowAddMemberModal(false)}
                    onSuccess={() => loadMembers(selectedTeam.id)}
                />
            )}

            {showVisibilitySettings && (
                <TeamVisibilityModal
                    teams={teams}
                    contacts={contacts}
                    settings={teamVisibility}
                    streamToken={streamToken}
                    onClose={() => setShowVisibilitySettings(false)}
                    onChange={setTeamVisibility}
                />
            )}
        </div>
    );
}

function SectionLabel({ label }: { label: string }) {
    return <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-telegram-subtext">{label}</p>;
}

interface MembersDrawerProps {
    members: TeamMember[];
    membersLoading: boolean;
    canManageMembers: boolean;
    streamToken: string;
    onClose: () => void;
    onAdd: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onRemove: (member: TeamMember) => void;
}

function MembersDrawer({
    members,
    membersLoading,
    canManageMembers,
    streamToken,
    onClose,
    onAdd,
    onEdit,
    onDelete,
    onRemove,
}: MembersDrawerProps) {
    return (
        <aside className="w-72 border-l border-telegram-border bg-telegram-surface flex flex-col">
            <div className="h-16 px-4 border-b border-telegram-border flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-telegram-text">Members</h3>
                    <p className="text-xs text-telegram-subtext">{members.length} people</p>
                </div>
                <button onClick={onClose} className="p-2 rounded-full hover:bg-telegram-hover text-telegram-subtext">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {canManageMembers && (
                <div className="p-3 grid grid-cols-3 gap-2 border-b border-telegram-border">
                    <button onClick={onAdd} className="rounded-lg bg-telegram-primary text-white px-3 py-2 text-xs font-medium">
                        Add
                    </button>
                    <button onClick={onEdit} className="rounded-lg bg-telegram-hover text-telegram-text px-3 py-2 text-xs font-medium">
                        Edit
                    </button>
                    <button onClick={onDelete} className="rounded-lg bg-red-500/10 text-red-400 px-3 py-2 text-xs font-medium">
                        Delete
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                {membersLoading ? (
                    <p className="p-3 text-sm text-telegram-subtext">Loading...</p>
                ) : members.length === 0 ? (
                    <p className="p-3 text-sm text-telegram-subtext">No members found</p>
                ) : (
                    members.map(member => (
                        <div key={member.user_id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-telegram-hover">
                            <TelegramAvatar user={member} token={streamToken} size="lg" />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1">
                                    <p className="truncate text-sm font-medium text-telegram-text">{member.first_name} {member.last_name || ''}</p>
                                </div>
                                <p className="truncate text-xs text-telegram-subtext">
                                    {member.is_owner ? 'Owner' : member.is_admin ? 'Admin' : member.username ? `@${member.username}` : 'Member'}
                                </p>
                            </div>
                            {canManageMembers && !member.is_owner && (
                                <button
                                    onClick={() => onRemove(member)}
                                    className="p-2 rounded-full hover:bg-red-500/10 text-red-400"
                                    title="Remove"
                                >
                                    <UserMinus className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>
        </aside>
    );
}

interface TeamFormModalProps {
    title: string;
    name: string;
    description: string;
    submitLabel: string;
    onNameChange: (value: string) => void;
    onDescriptionChange: (value: string) => void;
    onClose: () => void;
    onSubmit: () => void;
}

function TeamFormModal({
    title,
    name,
    description,
    submitLabel,
    onNameChange,
    onDescriptionChange,
    onClose,
    onSubmit,
}: TeamFormModalProps) {
    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
            <div className="w-full max-w-md rounded-xl border border-telegram-border bg-telegram-surface p-5 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-telegram-text">{title}</h3>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-telegram-hover text-telegram-subtext">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="space-y-4">
                    <input
                        autoFocus
                        value={name}
                        onChange={(e) => onNameChange(e.target.value)}
                        className="w-full rounded-lg border border-telegram-border bg-telegram-hover px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary"
                        placeholder="Group name"
                    />
                    <textarea
                        value={description}
                        onChange={(e) => onDescriptionChange(e.target.value)}
                        className="w-full resize-none rounded-lg border border-telegram-border bg-telegram-hover px-3 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary"
                        rows={3}
                        placeholder="Description"
                    />
                    <button onClick={onSubmit} className="w-full rounded-lg bg-telegram-primary px-4 py-2 text-sm font-medium text-white">
                        {submitLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
