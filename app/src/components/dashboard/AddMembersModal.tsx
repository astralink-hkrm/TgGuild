import { useState, useEffect } from 'react';
import { Search, X, Loader2, UserPlus, Check, Users } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { TelegramAvatar } from './TelegramAvatar';

interface TeamMember {
    user_id: string;
    first_name: string;
    last_name?: string | null;
    username?: string | null;
    photo_url?: string | null;
    access_hash?: string;
}

interface AddMembersModalProps {
    teamId: number;
    onClose: () => void;
    onSuccess?: () => void;
}

export function AddMembersModal({ teamId,     onClose, onSuccess }: AddMembersModalProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [results, setResults] = useState<TeamMember[]>([]);
    const [existingIds, setExistingIds] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSearching, setIsSearching] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [streamToken, setStreamToken] = useState('');

    useEffect(() => {
        invoke<string>('cmd_get_stream_token').then(setStreamToken).catch(console.error);
        loadExistingMembers();
    }, []);

    const loadExistingMembers = async () => {
        try {
            const members = await invoke<TeamMember[]>('cmd_get_team_members', { teamId });
            setExistingIds(new Set(members.map(m => m.user_id)));
        } catch (e) {
            console.error('Failed to load existing members:', e);
        }
    };

    useEffect(() => {
        if (searchQuery.length >= 2) {
            const timer = setTimeout(() => searchUsers(searchQuery), 300);
            return () => clearTimeout(timer);
        } else {
            setResults([]);
        }
    }, [searchQuery]);

    const searchUsers = async (query: string) => {
        setIsSearching(true);
        try {
            const [contactsResult, searchResult] = await Promise.allSettled([
                invoke<TeamMember[]>('cmd_get_contacts').catch(() => [] as TeamMember[]),
                invoke<TeamMember[]>('cmd_search_users', { query }),
            ]);
            const contacts = contactsResult.status === 'fulfilled' ? contactsResult.value : [];
            const searched = searchResult.status === 'fulfilled' ? searchResult.value : [];
            const merged = mergePeople(contacts, searched);
            setResults(merged.filter(m => !existingIds.has(m.user_id)));
        } catch (e) {
            console.error('Search failed:', e);
        } finally {
            setIsSearching(false);
        }
    };

    const toggleSelect = (userId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });
    };

    const handleAddSelected = async () => {
        const selected = results.filter(m => selectedIds.has(m.user_id));
        if (selected.length === 0) return;

        setIsAdding(true);
        let added = 0;
        for (const member of selected) {
            try {
                await invoke('cmd_add_team_member', {
                    teamId,
                    userIdStr: member.user_id,
                    accessHashStr: member.access_hash || null,
                });
                added++;
            } catch (e) {
                toast.error(`Failed to add ${member.first_name}: ${e}`);
            }
        }
        if (added > 0) {
            toast.success(`Added ${added} member${added > 1 ? 's' : ''} to the group`);
        }
        setIsAdding(false);
        onSuccess?.();
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-telegram-border bg-telegram-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-telegram-border p-4">
                    <h3 className="text-base font-semibold text-telegram-text">Add Members</h3>
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
                            placeholder="Search by name or @username..."
                            className="w-full rounded-lg bg-telegram-hover border border-telegram-border pl-10 pr-4 py-2 text-sm text-telegram-text outline-none focus:border-telegram-primary/50 transition-colors"
                            autoFocus
                        />
                        {isSearching && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <Loader2 className="h-4 w-4 text-telegram-primary animate-spin" />
                            </div>
                        )}
                    </div>
                </div>

                <div className="max-h-[360px] overflow-y-auto p-2 custom-scrollbar">
                    {searchQuery.length < 2 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-sm text-telegram-subtext">
                            <Users className="h-8 w-8 mb-2 opacity-50" />
                            Type at least 2 characters to search
                        </div>
                    ) : results.length > 0 ? (
                        results.map((member) => {
                            const isSelected = selectedIds.has(member.user_id);
                            return (
                                <div
                                    key={member.user_id}
                                    onClick={() => toggleSelect(member.user_id)}
                                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
                                        isSelected ? 'bg-telegram-primary/10' : 'hover:bg-telegram-hover'
                                    }`}
                                >
                                    <div className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors ${
                                        isSelected ? 'border-telegram-primary bg-telegram-primary' : 'border-telegram-border'
                                    }`}>
                                        {isSelected && <Check className="h-3 w-3 text-white" />}
                                    </div>
                                    <TelegramAvatar user={member} token={streamToken} size="lg" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-telegram-text truncate">
                                            {member.first_name} {member.last_name || ''}
                                        </p>
                                        {member.username && (
                                            <p className="text-xs text-telegram-subtext">@{member.username}</p>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-sm text-telegram-subtext">
                            <Users className="h-8 w-8 mb-2 opacity-50" />
                            No users found
                        </div>
                    )}
                </div>

                {selectedIds.size > 0 && (
                    <div className="border-t border-telegram-border p-3">
                        <button
                            onClick={handleAddSelected}
                            disabled={isAdding}
                            className="w-full flex items-center justify-center gap-2 rounded-lg bg-telegram-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-telegram-primary/90 transition-colors disabled:opacity-60"
                        >
                            {isAdding ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <UserPlus className="h-4 w-4" />
                            )}
                            Add {selectedIds.size} member{selectedIds.size > 1 ? 's' : ''}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function mergePeople(primary: TeamMember[], secondary: TeamMember[]) {
    const map = new Map<string, TeamMember>();
    [...primary, ...secondary].forEach(p => {
        const key = p.user_id;
        const existing = map.get(key);
        map.set(key, existing ? { ...existing, ...p, access_hash: existing.access_hash || p.access_hash } : p);
    });
    return Array.from(map.values());
}
