import { useState, useEffect, useRef } from 'react';
import { X, Search, UserPlus, UserMinus, MessageCircle, ArrowUp, ArrowDown, Loader2, Crown, Shield, User as UserIcon, MoreHorizontal } from 'lucide-react';
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
    const [promoteConfirm, setPromoteConfirm] = useState<TeamMember | null>(null);
    const [demoteConfirm, setDemoteConfirm] = useState<TeamMember | null>(null);
    const [contextMenu, setContextMenu] = useState<TeamMember | null>(null);
    const [transferConfirm, setTransferConfirm] = useState<TeamMember | null>(null);
    const [transferPassword, setTransferPassword] = useState('');
    const contextRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        invoke<string>('cmd_get_stream_token').then(setStreamToken).catch(console.error);
        loadMembers();
    }, [groupId]);

    useEffect(() => {
        if (!contextMenu) return;
        const handler = (e: MouseEvent) => {
            if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
                setContextMenu(null);
            }
        };
        window.addEventListener('mousedown', handler);
        return () => window.removeEventListener('mousedown', handler);
    }, [contextMenu]);

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
            setContextMenu(null);
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
            setContextMenu(null);
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
            setContextMenu(null);
            await loadMembers();
            onMembersChanged?.();
        } catch (e) {
            toast.error(`Failed to remove: ${e}`);
        } finally {
            setActionLoading(null);
        }
    };

    const handleTransferOwnership = async () => {
        if (!transferConfirm) return;
        setActionLoading(`transfer-${transferConfirm.user_id}`);
        try {
            await invoke('cmd_transfer_ownership', {
                teamId: groupId,
                newOwnerUserIdStr: transferConfirm.user_id,
                newOwnerAccessHashStr: transferConfirm.access_hash || null,
                password: transferPassword,
            });
            toast.success(`Ownership transferred to ${transferConfirm.first_name}`);
            setTransferConfirm(null);
            setTransferPassword('');
            setContextMenu(null);
            await loadMembers();
            onMembersChanged?.();
        } catch (e) {
            toast.error(`Failed to transfer: ${e}`);
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

    const roleBadge = (member: TeamMember) => {
        if (member.is_owner) return { icon: '👑', label: 'Owner', color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20' };
        if (member.is_admin) return { icon: '🛡', label: 'Admin', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
        return { icon: '👤', label: 'Member', color: 'text-telegram-subtext bg-telegram-hover/50 border-telegram-border/30' };
    };

    const owner = members.find(m => m.is_owner);
    const admins = members.filter(m => m.is_admin);
    const online = members.filter(m => m.online_status === 'online');

    const isOwner = currentUserId && owner?.user_id === currentUserId;
    const isAdmin = !isOwner && admins.some(a => a.user_id === currentUserId);

    const formatOnlineStatus = (status: string | null | undefined) => {
        if (status === 'online') return { text: 'Online', color: 'text-green-500', dot: '🟢' };
        if (!status) return { text: 'Offline', color: 'text-gray-500', dot: '⚪' };
        if (status.startsWith('last seen')) return { text: status, color: 'text-telegram-subtext', dot: '⚪' };
        return { text: status, color: 'text-telegram-subtext', dot: '⚪' };
    };

    const isCurrentUser = (member: TeamMember) => member.user_id === currentUserId;

    const canOwnerActOn = (member: TeamMember) => !member.is_owner && !isCurrentUser(member);
    const canAdminActOn = (member: TeamMember) => !member.is_owner && !member.is_admin && !isCurrentUser(member);

    return (
        <>
            <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-telegram-border px-4 py-3 shrink-0">
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

                {/* Quick Stats */}
                <div className="grid grid-cols-3 gap-2 px-4 py-3 border-b border-telegram-border bg-telegram-hover/20">
                    <div className="flex flex-col items-center rounded-xl bg-telegram-surface/50 px-3 py-2">
                        <span className="text-lg font-bold text-telegram-text">{members.length}</span>
                        <span className="text-[10px] text-telegram-subtext">Members</span>
                    </div>
                    <div className="flex flex-col items-center rounded-xl bg-telegram-surface/50 px-3 py-2">
                        <span className="text-lg font-bold text-blue-400">{admins.length}</span>
                        <span className="text-[10px] text-telegram-subtext">Admins</span>
                    </div>
                    <div className="flex flex-col items-center rounded-xl bg-telegram-surface/50 px-3 py-2">
                        <span className="text-lg font-bold text-green-500">{online.length}</span>
                        <span className="text-[10px] text-telegram-subtext">Online</span>
                    </div>
                </div>

                {/* Search & Sort */}
                <div className="px-4 py-2.5 border-b border-telegram-border space-y-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-telegram-subtext" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by name or username..."
                            className="w-full rounded-lg bg-telegram-hover border border-telegram-border pl-10 pr-4 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary/50 transition-colors"
                            autoFocus
                        />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-telegram-subtext">Sort:</span>
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

                {/* Member List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-sm text-telegram-subtext">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                            Loading members...
                        </div>
                    ) : sorted.length > 0 ? (
                        <div className="py-1">
                            {sorted.map((member) => {
                                const onlineInfo = formatOnlineStatus(member.online_status);
                                const badge = roleBadge(member);
                                const isCurrent = isCurrentUser(member);
                                return (
                                    <div key={member.user_id}>
                                        <div
                                            className="flex items-center gap-3 px-4 py-2.5 hover:bg-telegram-hover/50 transition-colors cursor-pointer"
                                            onClick={() => setContextMenu(contextMenu?.user_id === member.user_id ? null : member)}
                                        >
                                            <div className="relative flex-shrink-0">
                                                <TelegramAvatar user={member} token={streamToken} size="lg" />
                                                {member.online_status === 'online' && (
                                                    <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-telegram-surface bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-medium text-telegram-text truncate">
                                                        {member.first_name} {member.last_name || ''}
                                                        {isCurrent && <span className="ml-1 text-telegram-subtext font-normal">(you)</span>}
                                                    </span>
                                                    <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.color}`}>
                                                        <span className="text-[11px]">{badge.icon}</span>
                                                        {badge.label}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 text-[11px] text-telegram-subtext mt-0.5">
                                                    {member.username && <span className="text-telegram-primary/70">@{member.username}</span>}
                                                    <span className={onlineInfo.color}>{onlineInfo.dot} {onlineInfo.text}</span>
                                                    {member.joined_date && (
                                                        <span className="text-telegram-subtext/60">· Joined {member.joined_date}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setContextMenu(contextMenu?.user_id === member.user_id ? null : member); }}
                                                className="p-1.5 rounded-lg text-telegram-subtext hover:text-telegram-text hover:bg-telegram-hover transition-colors opacity-0 group-hover:opacity-100"
                                            >
                                                <MoreHorizontal className="h-4 w-4" />
                                            </button>
                                        </div>

                                        {/* Context Menu */}
                                        {contextMenu?.user_id === member.user_id && (
                                            <div ref={contextRef} className="mx-4 mb-1 rounded-xl border border-telegram-border bg-telegram-surface shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-100">
                                                <div className="flex items-center gap-3 px-3 py-2.5 border-b border-telegram-border/50 bg-telegram-hover/20">
                                                    <TelegramAvatar user={member} token={streamToken} size="sm" />
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-medium text-telegram-text truncate">{member.first_name} {member.last_name || ''}</p>
                                                        {member.username && <p className="text-[11px] text-telegram-subtext">@{member.username}</p>}
                                                    </div>
                                                </div>
                                                <div className="py-1">
                                                    {onOpenDirectChat && !isCurrent && (
                                                        <button
                                                            onClick={() => { setContextMenu(null); onOpenDirectChat({ user_id: Number(member.user_id), first_name: member.first_name, photo_url: member.photo_url }); }}
                                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-telegram-text hover:bg-telegram-hover transition-colors"
                                                        >
                                                            <MessageCircle className="h-4 w-4 text-telegram-primary" />
                                                            Send Message
                                                        </button>
                                                    )}
                                                    {isOwner && canOwnerActOn(member) && !member.is_admin && (
                                                        <button
                                                            onClick={() => { setContextMenu(null); setPromoteConfirm(member); }}
                                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-telegram-text hover:bg-telegram-hover transition-colors"
                                                        >
                                                            <Shield className="h-4 w-4 text-blue-400" />
                                                            Make Admin
                                                        </button>
                                                    )}
                                                    {isOwner && canOwnerActOn(member) && member.is_admin && (
                                                        <button
                                                            onClick={() => { setContextMenu(null); setDemoteConfirm(member); }}
                                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-telegram-text hover:bg-telegram-hover transition-colors"
                                                        >
                                                            <ArrowDown className="h-4 w-4 text-orange-400" />
                                                            Remove Admin
                                                        </button>
                                                    )}
                                                    {isOwner && canOwnerActOn(member) && (
                                                        <>
                                                            <button
                                                                onClick={() => { setContextMenu(null); setRemoveConfirm(member.user_id); }}
                                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                                            >
                                                                <UserMinus className="h-4 w-4" />
                                                                Remove Member
                                                            </button>
                                                            <button
                                                                onClick={() => { setContextMenu(null); setTransferConfirm(member); }}
                                                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-orange-400 hover:bg-orange-500/10 transition-colors"
                                                            >
                                                                <Crown className="h-4 w-4" />
                                                                Transfer Ownership
                                                            </button>
                                                        </>
                                                    )}
                                                    {(isAdmin || isOwner) && canAdminActOn(member) && (
                                                        <button
                                                            onClick={() => { setContextMenu(null); setRemoveConfirm(member.user_id); }}
                                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                                                        >
                                                            <UserMinus className="h-4 w-4" />
                                                            Remove Member
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Inline Remove Confirm */}
                                        {removeConfirm === member.user_id && (
                                            <div className="flex items-center justify-end gap-2 px-4 pb-2">
                                                <span className="text-xs text-telegram-subtext">Remove {member.first_name}?</span>
                                                <button
                                                    onClick={() => handleRemove(member)}
                                                    disabled={actionLoading !== null}
                                                    className="px-2.5 py-1 bg-red-500/10 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                                >
                                                    {actionLoading === `remove-${member.user_id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Remove'}
                                                </button>
                                                <button
                                                    onClick={() => setRemoveConfirm(null)}
                                                    className="px-2 py-1 text-telegram-subtext rounded-lg text-xs hover:bg-telegram-hover transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-telegram-subtext">
                            <UserIcon className="h-10 w-10 mb-2 opacity-40" />
                            <p className="text-sm">{searchQuery ? 'No matching members found' : 'No members'}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Promote Confirm Modal */}
            {promoteConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setPromoteConfirm(null)}>
                    <div className="w-80 rounded-2xl bg-telegram-surface border border-telegram-border shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-base font-semibold text-telegram-text mb-2">Make Admin</h3>
                        <p className="text-sm text-telegram-subtext mb-5">
                            Promote <strong>{promoteConfirm.first_name}</strong> to admin? They will gain administrative permissions.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setPromoteConfirm(null)} className="px-4 py-2 rounded-xl text-sm font-medium text-telegram-text hover:bg-telegram-hover transition-colors">
                                Cancel
                            </button>
                            <button onClick={() => { const m = promoteConfirm; setPromoteConfirm(null); handlePromote(m); }} className="px-4 py-2 rounded-xl text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 transition-colors">
                                Promote to Admin
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Demote Confirm Modal */}
            {demoteConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setDemoteConfirm(null)}>
                    <div className="w-80 rounded-2xl bg-telegram-surface border border-telegram-border shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-base font-semibold text-telegram-text mb-2">Remove Admin</h3>
                        <p className="text-sm text-telegram-subtext mb-5">
                            Remove admin privileges from <strong>{demoteConfirm.first_name}</strong>? They will become a regular member.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setDemoteConfirm(null)} className="px-4 py-2 rounded-xl text-sm font-medium text-telegram-text hover:bg-telegram-hover transition-colors">
                                Cancel
                            </button>
                            <button onClick={() => { const m = demoteConfirm; setDemoteConfirm(null); handleDemote(m); }} className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors">
                                Remove Admin
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Transfer Ownership Modal */}
            {transferConfirm && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setTransferConfirm(null); setTransferPassword(''); }}>
                    <div className="w-80 rounded-2xl bg-telegram-surface border border-telegram-border shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-base font-semibold text-telegram-text mb-2">Transfer Ownership</h3>
                        <p className="text-sm text-telegram-subtext mb-4">
                            Transfer group ownership to <strong>{transferConfirm.first_name}</strong>? This action cannot be undone.
                        </p>
                        <p className="text-xs text-orange-400 mb-3">
                            ⚠️ Requires Two-Factor Authentication. Enter your 2FA password below.
                        </p>
                        <input
                            type="password"
                            value={transferPassword}
                            onChange={(e) => setTransferPassword(e.target.value)}
                            placeholder="2FA password (if enabled)"
                            className="w-full rounded-lg bg-telegram-hover border border-telegram-border px-3 py-2 text-sm text-telegram-text outline-none mb-4 focus:border-telegram-primary/50 transition-colors"
                        />
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => { setTransferConfirm(null); setTransferPassword(''); }} className="px-4 py-2 rounded-xl text-sm font-medium text-telegram-text hover:bg-telegram-hover transition-colors">
                                Cancel
                            </button>
                            <button
                                onClick={handleTransferOwnership}
                                disabled={actionLoading !== null}
                                className="px-4 py-2 rounded-xl text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center gap-1"
                            >
                                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                Transfer
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
