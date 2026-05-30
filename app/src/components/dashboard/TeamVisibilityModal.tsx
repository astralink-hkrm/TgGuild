import { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import {
    saveTeamVisibility,
    TeamVisibilitySettings,
} from './teamVisibility';
import { TelegramAvatar } from './TelegramAvatar';

interface TeamItem {
    id: number;
    name: string;
    username: string | null;
    member_count: number;
}

interface ContactItem {
    user_id: string;
    first_name: string;
    last_name?: string | null;
    username?: string | null;
    phone?: string | null;
}

interface TeamVisibilityModalProps {
    teams: TeamItem[];
    contacts: ContactItem[];
    drives: TeamItem[];
    settings: TeamVisibilitySettings;
    streamToken?: string;
    onClose: () => void;
    onChange: (settings: TeamVisibilitySettings) => void;
}

export function TeamVisibilityModal({
    teams,
    contacts,
    drives,
    settings,
    streamToken,
    onClose,
    onChange,
}: TeamVisibilityModalProps) {
    const [query, setQuery] = useState('');

    const filteredTeams = useMemo(() => {
        const needle = query.toLowerCase();
        return teams.filter(team => `${team.name} ${team.username || ''}`.toLowerCase().includes(needle));
    }, [teams, query]);

    const filteredContacts = useMemo(() => {
        const needle = query.toLowerCase();
        return contacts.filter(contact => (
            `${contact.first_name} ${contact.last_name || ''} ${contact.username || ''} ${contact.phone || ''}`
                .toLowerCase()
                .includes(needle)
        ));
    }, [contacts, query]);

    const filteredDrives = useMemo(() => {
        const needle = query.toLowerCase();
        return drives.filter(drive => `${drive.name} ${drive.username || ''}`.toLowerCase().includes(needle));
    }, [drives, query]);

    const updateSettings = (next: TeamVisibilitySettings) => {
        saveTeamVisibility(next);
        onChange(next);
    };

    const toggleTeam = (id: number) => {
        const key = String(id);
        const hiddenTeamIds = settings.hiddenTeamIds.includes(key)
            ? settings.hiddenTeamIds.filter(item => item !== key)
            : [...settings.hiddenTeamIds, key];
        updateSettings({ ...settings, hiddenTeamIds });
    };

    const toggleContact = (id: string) => {
        const key = String(id);
        const hiddenContactIds = settings.hiddenContactIds.includes(key)
            ? settings.hiddenContactIds.filter(item => item !== key)
            : [...settings.hiddenContactIds, key];
        updateSettings({ ...settings, hiddenContactIds });
    };

    const toggleDrive = (id: number) => {
        const key = String(id);
        const hiddenDriveIds = settings.hiddenDriveIds.includes(key)
            ? settings.hiddenDriveIds.filter(item => item !== key)
            : [...settings.hiddenDriveIds, key];
        updateSettings({ ...settings, hiddenDriveIds });
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
            <div
                className="w-full max-w-xl overflow-hidden rounded-xl border border-telegram-border bg-telegram-surface shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-telegram-border p-4">
                    <div>
                        <h3 className="text-base font-semibold text-telegram-text">Visibility Settings</h3>
                        <p className="text-xs text-telegram-subtext">Choose which items appear in the sidebar.</p>
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
                            placeholder="Search groups, people or drives"
                            className="w-full rounded-xl border border-telegram-border bg-telegram-hover py-2 pl-9 pr-3 text-sm text-telegram-text outline-none focus:border-telegram-primary"
                        />
                    </div>
                </div>

                <div className="max-h-[480px] overflow-y-auto p-3 custom-scrollbar">
                    {filteredDrives.length > 0 && (
                        <>
                            <VisibilitySection label="Drives" count={filteredDrives.length} />
                            {filteredDrives.map(drive => {
                                const checked = !settings.hiddenDriveIds.includes(String(drive.id));
                                return (
                                    <button
                                        key={drive.id}
                                        onClick={() => toggleDrive(drive.id)}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-telegram-hover"
                                    >
                                        <Checkbox checked={checked} />
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-telegram-text">{drive.name}</p>
                                            <p className="truncate text-xs text-telegram-subtext">
                                                {drive.member_count} members{drive.username ? ` • @${drive.username}` : ''}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </>
                    )}

                    <VisibilitySection label="Groups" count={filteredTeams.length} />
                    {filteredTeams.map(team => {
                        const checked = !settings.hiddenTeamIds.includes(String(team.id));
                        return (
                            <button
                                key={team.id}
                                onClick={() => toggleTeam(team.id)}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-telegram-hover"
                            >
                                <Checkbox checked={checked} />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-telegram-text">{team.name}</p>
                                    <p className="truncate text-xs text-telegram-subtext">
                                        {team.member_count} members{team.username ? ` • @${team.username}` : ''}
                                    </p>
                                </div>
                            </button>
                        );
                    })}

                    <VisibilitySection label="Direct Messages" count={filteredContacts.length} />
                    {filteredContacts.map(contact => {
                        const checked = !settings.hiddenContactIds.includes(String(contact.user_id));
                        return (
                            <button
                                key={contact.user_id}
                                onClick={() => toggleContact(contact.user_id)}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-telegram-hover"
                            >
                                <Checkbox checked={checked} />
                                <TelegramAvatar user={contact} token={streamToken} size="md" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-telegram-text">{contact.first_name} {contact.last_name || ''}</p>
                                    <p className="truncate text-xs text-telegram-subtext">
                                        {contact.username ? `@${contact.username}` : contact.phone || 'Telegram contact'}
                                    </p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function VisibilitySection({ label, count }: { label: string; count: number }) {
    return (
        <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-telegram-subtext">
            {label} ({count})
        </div>
    );
}

function Checkbox({ checked }: { checked: boolean }) {
    return (
        <span className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
            checked
                ? 'border-telegram-primary bg-telegram-primary text-white'
                : 'border-telegram-border bg-telegram-hover text-transparent'
        }`}>
            <Check className="h-3.5 w-3.5" />
        </span>
    );
}
