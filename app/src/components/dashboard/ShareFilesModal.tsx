import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Building2, ChevronDown, ChevronRight, Folder, MessageSquare, Search, Users, X } from 'lucide-react';
import { TelegramFolder } from '../../types';
import { TelegramAvatar } from './TelegramAvatar';

interface TeamInfo {
    id: number;
    name: string;
    username: string | null;
    member_count: number;
}

interface DirectChatInfo {
    user_id: string;
    first_name: string;
    last_name?: string | null;
    username?: string | null;
    phone?: string | null;
}

interface Destination {
    id: number | null;
    type: 'drive' | 'team' | 'direct';
    title: string;
    subtitle: string;
    user?: DirectChatInfo;
}

interface ShareFilesModalProps {
    folders: TelegramFolder[];
    selectedCount: number;
    onClose: () => void;
    onShare: (targetFolderId: number | null) => Promise<void>;
}

export function ShareFilesModal({ folders, selectedCount, onClose, onShare }: ShareFilesModalProps) {
    const [teams, setTeams] = useState<TeamInfo[]>([]);
    const [directChats, setDirectChats] = useState<DirectChatInfo[]>([]);
    const [streamToken, setStreamToken] = useState('');
    const [query, setQuery] = useState('');
    const [sharingTo, setSharingTo] = useState<string | null>(null);
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        company: true,
        drive: true,
        teams: true,
        direct: true,
    });

    useEffect(() => {
        Promise.all([
            invoke<{ teams: TeamInfo[] }>('cmd_get_teams').catch(() => ({ teams: [] })),
            invoke<{ chats: DirectChatInfo[] }>('cmd_get_direct_chats').catch(() => ({ chats: [] })),
            invoke<string>('cmd_get_stream_token').catch(() => ''),
        ]).then(([teamResp, directResp, token]) => {
            setTeams(teamResp.teams);
            setDirectChats(directResp.chats);
            setStreamToken(token);
        });
    }, []);

    const sections = useMemo(() => {
        const company: Destination[] = [
            { id: null, type: 'drive', title: 'Saved Messages', subtitle: 'Personal drive' },
        ];
        const drive: Destination[] = folders.map(folder => ({
                id: folder.id,
                type: 'drive' as const,
                title: folder.name,
                subtitle: 'Drive folder',
            }));
        const teamItems: Destination[] = teams.map(team => ({
                id: team.id,
                type: 'team' as const,
                title: team.name,
                subtitle: `${team.member_count || 0} members`,
            }));
        const direct: Destination[] = directChats.map(chat => ({
                id: Number(chat.user_id),
                type: 'direct' as const,
                title: `${chat.first_name} ${chat.last_name || ''}`.trim(),
                subtitle: chat.username ? `@${chat.username}` : chat.phone || 'One on one',
                user: chat,
            }));
        const needle = query.toLowerCase();
        const filter = (items: Destination[]) => items.filter(item => `${item.title} ${item.subtitle}`.toLowerCase().includes(needle));
        return [
            { key: 'company', label: 'Company', items: filter(company) },
            { key: 'drive', label: 'Drive', items: filter(drive) },
            { key: 'teams', label: 'Teams', items: filter(teamItems) },
            { key: 'direct', label: 'One on One', items: filter(direct) },
        ];
    }, [folders, teams, directChats, query]);

    const destinationCount = sections.reduce((sum, section) => sum + section.items.length, 0);

    const handleShare = async (destination: Destination) => {
        const key = `${destination.type}:${destination.id ?? 'self'}`;
        setSharingTo(key);
        try {
            await onShare(destination.id);
            onClose();
        } finally {
            setSharingTo(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
            <div
                className="w-full max-w-xl overflow-hidden rounded-xl border border-telegram-border bg-telegram-surface shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-telegram-border p-4">
                    <div>
                        <h3 className="text-base font-semibold text-telegram-text">Share Files</h3>
                        <p className="text-xs text-telegram-subtext">{selectedCount} selected</p>
                    </div>
                    <button onClick={onClose} className="rounded-full p-2 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="border-b border-telegram-border p-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-telegram-subtext" />
                        <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder="Search drives, teams, or people"
                            className="w-full rounded-xl border border-telegram-border bg-telegram-hover py-2 pl-9 pr-3 text-sm text-telegram-text outline-none focus:border-telegram-primary"
                        />
                    </div>
                </div>

                <div className="max-h-[480px] overflow-y-auto p-3 custom-scrollbar">
                    {sections.map(section => (
                        <div key={section.key} className="mb-2">
                            <button
                                onClick={() => setOpenSections(current => ({ ...current, [section.key]: !current[section.key] }))}
                                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text"
                            >
                                <span>{section.label} ({section.items.length})</span>
                                {openSections[section.key] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                            {openSections[section.key] && section.items.map(destination => {
                                const key = `${destination.type}:${destination.id ?? 'self'}`;
                                return (
                                    <button
                                        key={key}
                                        onClick={() => handleShare(destination)}
                                        disabled={sharingTo !== null}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-telegram-text hover:bg-telegram-hover disabled:opacity-60"
                                    >
                                        <DestinationIcon destination={destination} streamToken={streamToken} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">{destination.title}</span>
                                            <span className="block truncate text-xs text-telegram-subtext">{destination.subtitle}</span>
                                        </span>
                                        {sharingTo === key && <span className="h-4 w-4 rounded-full border-2 border-telegram-primary border-t-transparent animate-spin" />}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                    {destinationCount === 0 && (
                        <div className="py-10 text-center text-sm text-telegram-subtext">No destinations found</div>
                    )}
                </div>
            </div>
        </div>
    );
}

function DestinationIcon({ destination, streamToken }: { destination: Destination; streamToken: string }) {
    if (destination.type === 'direct' && destination.user) {
        return <TelegramAvatar user={destination.user} token={streamToken} size="md" />;
    }

    const Icon = destination.type === 'drive'
        ? destination.id === null ? Building2 : Folder
        : destination.type === 'team' ? Users : MessageSquare;

    return (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-telegram-hover text-telegram-primary">
            <Icon className="h-4 w-4" />
        </span>
    );
}
