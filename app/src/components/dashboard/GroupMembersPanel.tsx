import { useState, useEffect } from 'react';
import { X, Search, Crown, Shield, User, UserPlus, UserMinus, MessageCircle, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { TelegramAvatar } from './TelegramAvatar';
import { AddMembersModal } from './AddMembersModal';

interface TeamMember {
    user_id: string;
    first_name: string;
    last_name?: string | null;
    username?: string | null;
    photo_url?: string | null;
    is_owner?: boolean;
    is_admin?: boolean;
    role?: string;
    access_hash?: string;
    joined_date?: string | null;
    online_status?: string | null;
}

interface GroupMembersPanelProps {
    groupId: number;
    currentUserId?: string;
    canManageMembers?: boolean;
    onClose: () => void;
    onOpenDirectChat?: (user: { user_id: number; first_name: string; photo_url?: string | null }) => void;
    onMembersChanged?: () => void;
}

type SortKey = 'name' | 'join_date' | 'role' | 'online';

export function GroupMembersPanel({ groupId, currentUserId, canManageMembers, onClose, onOpenDirectChat, onMembersChanged }: GroupMembersPanelProps) {
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<SortKey>('name');
    const [sortAsc, setSortAsc] = useState(true);
    const [streamToken, setStreamToken] = useState('');
    const [showAddMembers, setShowAddMembers] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);

    useEffect(() => {
        invoke<string>('cmd_get_stream_token').then(setStreamToken).catch(console.error);
        loadMembers();
    }, [groupId]);

    const loadMembers = async () => {
        setLoading(true);
        try {
            const res = await invoke<TeamMember[]>('cmd_get_team_members', { teamId: groupId });
            setMembers(res);
        } catch (e) {
            toast.error(`Failed to load members: ${e}`);
        } finally {
            setLoading(false);
        }
    };

    const handlePromote = async (member: TeamMember) => {
        setActionLoading(`promote-${member.user_id}`);
        try {
            await invoke('cmd_set_member_role', {
                teamId: groupId,
                userIdStr: member.user_id,
                accessHashStr: member.access_hash || null,
                role: 'admin',
            });
            toast.success(`${member.first_name} promoted to admin`);
            await loadMembers();
            onMembersChanged?.();
        } catch (e) {
            toast.error(`Failed to promote: ${e}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleDemote = async (member: TeamMember) => {
        setActionLoading(`demote-${member.user_id}`);
        try {
            await invoke('cmd_set_member_role', {
                teamId: groupId,
                userIdStr: member.user_id,
                accessHashStr: member.access_hash || null,
                role: 'member',
            });
            toast.success(`${member.first_name} demoted to member`);
            await loadMembers();
            onMembersChanged?.();
        } catch (e) {
            toast.error(`Failed to demote: ${e}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleRemove = async (member: TeamMember) => {
        setActionLoading(`remove-${member.user_id}`);
        try {
            await invoke('cmd_remove_team_member', {
                teamId: groupId,
                userIdStr: member.user_id,
                accessHashStr: member.access_hash || null,
            });
            toast.success(`${member.first_name} removed from group`);
            setRemoveConfirm(null);
            await loadMembers();
            onMembersChanged?.();
        } catch (e) {
            toast.error(`Failed to remove: ${e}`);
        } finally {
            setActionLoading(null);
        }
    };

    const toggleSort = (key: SortKey) => {
        if (sortBy === key) {
            setSortAsc(!sortAsc);
        } else {
            setSortBy(key);
            setSortAsc(true);
        }
    };

    const filtered = members.filter((m) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            m.first_name.toLowerCase().includes(q) ||
            (m.last_name?.toLowerCase() || '').includes(q) ||
            (m.username?.toLowerCase() || '').includes(q)
        );
    });

    const sorted = [...filtered].sort((a, b) => {
        let cmp = 0;
        switch (sortBy) {
            case 'name': {
                const aName = `${a.first_name} ${a.last_name || ''}`.toLowerCase();
                const bName = `${b.first_name} ${b.last_name || ''}`.toLowerCase();
                cmp = aName.localeCompare(bName);
                break;
            }
            case 'role': {
                const roleOrder = { owner: 0, admin: 1, member: 2 };
                cmp = (roleOrder[a.role as keyof typeof roleOrder] ?? 3) - (roleOrder[b.role as keyof typeof roleOrder] ?? 3);
                break;
            }
            case 'join_date': {
                cmp = (a.joined_date || '').localeCompare(b.joined_date || '');
                break;
            }
            case 'online': {
                const aOnline = a.online_status === 'online' ? 0 : 1;
                const bOnline = b.online_status === 'online' ? 0 : 1;
                cmp = aOnline - bOnline;
                break;
            }
        }
        return sortAsc ? cmp : -cmp;
    });

    const roleIcon = (member: TeamMember) => {
        if (member.is_owner) return <Crown className="h-3.5 w-3.5 text-yellow-500" />;
        if (member.is_admin) return <Shield className="h-3.5 w-3.5 text-blue-400" />;
        return <User className="h-3.5 w-3.5 text-telegram-subtext" />;
    };

    const roleLabel = (member: TeamMember) => {
        if (member.is_owner) return 'Owner';
        if (member.is_admin) return 'Admin';
        return 'Member';
    };

    const isCurrentUser = (member: TeamMember) => member.user_id === currentUserId;

    return (
        <>
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
                <div className="w-full max-w-lg overflow-hidden rounded-xl border border-telegram-border bg-telegram-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between border-b border-telegram-border p-4">
                        <div>
                            <h3 className="text-base font-semibold text-telegram-text">Group Members</h3>
                            <p className="text-xs text-telegram-subtext">{members.length} total</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {canManageMembers && (
                                <button
                                    onClick={() => setShowAddMembers(true)}
                                    className="flex items-center gap-1.5 rounded-lg bg-telegram-primary/10 px-3 py-1.5 text-sm text-telegram-primary hover:bg-telegram-primary/20 transition-colors"
                                >
                                    <UserPlus className="h-4 w-4" />
                                    Add
                                </button>
                            )}
                            <button onClick={onClose} className="rounded-full p-2 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors">
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <div className="border-b border-telegram-border p-3 space-y-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-telegram-subtext" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search members..."
                                className="w-full rounded-lg bg-telegram-hover border border-telegram-border pl-10 pr-4 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary/50 transition-colors"
                                autoFocus
                            />
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <span className="text-telegram-subtext">Sort by:</span>
                            {(['name', 'role', 'join_date', 'online'] as SortKey[]).map((key) => (
                                <button
                                    key={key}
                                    onClick={() => toggleSort(key)}
                                    className={`flex items-center gap-1 rounded-md px-2 py-1 transition-colors ${
                                        sortBy === key
                                            ? 'bg-telegram-primary/10 text-telegram-primary'
                                            : 'text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover'
                                    }`}
                                >
                                    {key === 'name' ? 'Name' : key === 'role' ? 'Role' : key === 'join_date' ? 'Joined' : 'Online'}
                                    {sortBy === key && (sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="max-h-[420px] overflow-y-auto p-2 custom-scrollbar">
                        {loading ? (
                            <div className="flex items-center justify-center py-12 text-sm text-telegram-subtext">Loading members...</div>
                        ) : sorted.length > 0 ? (
                            sorted.map((member) => {
                                const isOnline = member.online_status === 'online';
                                const isCurrent = isCurrentUser(member);
                                return (
                                    <div key={member.user_id} className="group flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-telegram-hover transition-colors">
                                        <div className="relative flex-shrink-0">
                                            <TelegramAvatar user={member} token={streamToken} size="lg" />
                                            {isOnline && (
                                                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-telegram-surface bg-green-500" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-telegram-text truncate">
                                                    {member.first_name} {member.last_name || ''}
                                                    {isCurrent && <span className="ml-1 text-telegram-subtext font-normal">(you)</span>}
                                                </span>
                                                <span className="flex-shrink-0" title={roleLabel(member)}>
                                                    {roleIcon(member)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-telegram-subtext">
                                                {member.username && <span>@{member.username}</span>}
                                                <span className="rounded bg-telegram-hover px-1.5 py-0.5 text-[10px] font-medium">
                                                    {roleLabel(member)}
                                                </span>
                                                {member.online_status && member.online_status !== 'online' && (
                                                    <span className="text-[10px]">{member.online_status}</span>
                                                )}
                                            </div>
                                            {member.joined_date && (
                                                <p className="mt-0.5 text-[10px] text-telegram-subtext/60">Joined {member.joined_date}</p>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            {onOpenDirectChat && !isCurrent && (
                                                <button
                                                    onClick={() => onOpenDirectChat({ user_id: Number(member.user_id), first_name: member.first_name, photo_url: member.photo_url })}
                                                    className="p-1.5 hover:bg-telegram-primary/10 text-telegram-primary rounded-lg transition-colors"
                                                    title="Send message"
                                                >
                                                    <MessageCircle className="h-4 w-4" />
                                                </button>
                                            )}
                                            {canManageMembers && !member.is_owner && !isCurrent && (
                                                <>
                                                    {member.is_admin ? (
                                                        <button
                                                            onClick={() => handleDemote(member)}
                                                            disabled={actionLoading !== null}
                                                            className="p-1.5 hover:bg-orange-500/10 text-orange-400 rounded-lg transition-colors disabled:opacity-50"
                                                            title="Demote to member"
                                                        >
                                                            {actionLoading === `demote-${member.user_id}` ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <ArrowDown className="h-4 w-4" />
                                                            )}
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => handlePromote(member)}
                                                            disabled={actionLoading !== null}
                                                            className="p-1.5 hover:bg-blue-500/10 text-blue-400 rounded-lg transition-colors disabled:opacity-50"
                                                            title="Promote to admin"
                                                        >
                                                            {actionLoading === `promote-${member.user_id}` ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                <ArrowUp className="h-4 w-4" />
                                                            )}
                                                        </button>
                                                    )}
                                                    {removeConfirm === member.user_id ? (
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => handleRemove(member)}
                                                                disabled={actionLoading !== null}
                                                                className="px-2 py-1 bg-red-500/10 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                                            >
                                                                {actionLoading === `remove-${member.user_id}` ? (
                                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                                ) : 'Confirm'}
                                                            </button>
                                                            <button
                                                                onClick={() => setRemoveConfirm(null)}
                                                                className="px-2 py-1 text-telegram-subtext rounded-lg text-xs hover:bg-telegram-hover transition-colors"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => setRemoveConfirm(member.user_id)}
                                                            disabled={actionLoading !== null}
                                                            className="p-1.5 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors disabled:opacity-50"
                                                            title="Remove member"
                                                        >
                                                            <UserMinus className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="flex items-center justify-center py-12 text-sm text-telegram-subtext">
                                {searchQuery ? 'No matching members found' : 'No members'}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {showAddMembers && (
                <AddMembersModal
                    teamId={groupId}
                    onClose={() => setShowAddMembers(false)}
                    onSuccess={() => {
                        setShowAddMembers(false);
                        loadMembers();
                        onMembersChanged?.();
                    }}
                />
            )}
        </>
    );
}
