import { useState, useEffect } from 'react';
import { X, Crown, Shield, User, Search } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { TelegramAvatar } from './TelegramAvatar';

interface TeamMember {
    user_id: string;
    first_name: string;
    last_name?: string | null;
    username?: string | null;
    photo_url?: string | null;
    is_owner?: boolean;
    is_admin?: boolean;
    role?: string;
}

interface MemberListModalProps {
    groupId: number;
    onClose: () => void;
}

export function MemberListModal({ groupId, onClose }: MemberListModalProps) {
    const [members, setMembers] = useState<TeamMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [streamToken, setStreamToken] = useState('');

    useEffect(() => {
        invoke<string>('cmd_get_stream_token').then(setStreamToken).catch(console.error);
        invoke<TeamMember[]>('cmd_get_team_members', { teamId: groupId })
            .then(setMembers)
            .catch((e) => toast.error(`Failed to load members: ${e}`))
            .finally(() => setLoading(false));
    }, [groupId]);

    const filtered = members.filter((m) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            m.first_name.toLowerCase().includes(q) ||
            (m.last_name?.toLowerCase() || '').includes(q) ||
            (m.username?.toLowerCase() || '').includes(q)
        );
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

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="w-full max-w-lg overflow-hidden rounded-xl border border-telegram-border bg-telegram-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-telegram-border p-4">
                    <div>
                        <h3 className="text-base font-semibold text-telegram-text">Members</h3>
                        <p className="text-xs text-telegram-subtext">{members.length} total</p>
                    </div>
                    <button onClick={onClose} className="rounded-full p-2 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="p-3 border-b border-telegram-border">
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
                </div>

                <div className="max-h-[400px] overflow-y-auto p-2 custom-scrollbar">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-sm text-telegram-subtext">Loading members...</div>
                    ) : filtered.length > 0 ? (
                        filtered.map((member) => (
                            <div key={member.user_id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-telegram-hover transition-colors group">
                                <TelegramAvatar user={member} token={streamToken} size="lg" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-telegram-text truncate">
                                            {member.first_name} {member.last_name || ''}
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
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="flex items-center justify-center py-12 text-sm text-telegram-subtext">
                            {searchQuery ? 'No matching members found' : 'No members'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
