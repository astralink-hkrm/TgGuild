import { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { WorkspacePrefs, saveWorkspacePrefs } from './workspaceVisibility';
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

interface WorkspaceVisibilityModalProps {
  teams: TeamItem[];
  contacts: ContactItem[];
  drives: TeamItem[];
  prefs: WorkspacePrefs;
  streamToken?: string;
  mode?: 'setup' | 'settings';
  onClose: () => void;
  onSave: (prefs: WorkspacePrefs) => void;
}

export function WorkspaceVisibilityModal({
  teams,
  contacts,
  drives,
  prefs,
  streamToken,
  mode = 'settings',
  onClose,
  onSave,
}: WorkspaceVisibilityModalProps) {
  const [draft, setDraft] = useState<WorkspacePrefs>(() => ({
    ...prefs,
    visibleDrives: [...prefs.visibleDrives],
    visibleGroups: [...prefs.visibleGroups],
    visibleDMs: [...prefs.visibleDMs],
  }));
  const [query, setQuery] = useState('');

  const filteredTeams = useMemo(() => {
    const needle = query.toLowerCase();
    return teams.filter(team => `${team.name} ${team.username || ''}`.toLowerCase().includes(needle));
  }, [teams, query]);

  const filteredContacts = useMemo(() => {
    const needle = query.toLowerCase();
    return contacts.filter(contact =>
      `${contact.first_name} ${contact.last_name || ''} ${contact.username || ''} ${contact.phone || ''}`
        .toLowerCase()
        .includes(needle)
    );
  }, [contacts, query]);

  const filteredDrives = useMemo(() => {
    const needle = query.toLowerCase();
    return drives.filter(drive => `${drive.name} ${drive.username || ''}`.toLowerCase().includes(needle));
  }, [drives, query]);

  const allSelected = useMemo(() => {
    if (draft.performanceMode) {
      const allDrives = filteredDrives.every(d => draft.visibleDrives.includes(d.id));
      const allTeams = filteredTeams.every(t => draft.visibleGroups.includes(t.id));
      const allDMs = filteredContacts.every(c => draft.visibleDMs.includes(c.user_id));
      return allDrives && allTeams && allDMs;
    }
    return true;
  }, [filteredDrives, filteredTeams, filteredContacts, draft]);

  const toggleAll = () => {
    if (!draft.performanceMode) return;
    if (allSelected) {
      setDraft(prev => ({
        ...prev,
        visibleDrives: prev.visibleDrives.filter(id => !filteredDrives.some(d => d.id === id)),
        visibleGroups: prev.visibleGroups.filter(id => !filteredTeams.some(t => t.id === id)),
        visibleDMs: prev.visibleDMs.filter(id => !filteredContacts.some(c => c.user_id === id)),
      }));
    } else {
      setDraft(prev => ({
        ...prev,
        visibleDrives: [...new Set([...prev.visibleDrives, ...filteredDrives.map(d => d.id)])],
        visibleGroups: [...new Set([...prev.visibleGroups, ...filteredTeams.map(t => t.id)])],
        visibleDMs: [...new Set([...prev.visibleDMs, ...filteredContacts.map(c => c.user_id)])],
      }));
    }
  };

  const toggleDrive = (id: number) => {
    setDraft(prev => ({
      ...prev,
      visibleDrives: prev.visibleDrives.includes(id)
        ? prev.visibleDrives.filter(i => i !== id)
        : [...prev.visibleDrives, id],
    }));
  };

  const toggleTeam = (id: number) => {
    setDraft(prev => ({
      ...prev,
      visibleGroups: prev.visibleGroups.includes(id)
        ? prev.visibleGroups.filter(i => i !== id)
        : [...prev.visibleGroups, id],
    }));
  };

  const toggleDM = (id: string) => {
    setDraft(prev => ({
      ...prev,
      visibleDMs: prev.visibleDMs.includes(id)
        ? prev.visibleDMs.filter(i => i !== id)
        : [...prev.visibleDMs, id],
    }));
  };

  const handleSave = async () => {
    const saved = { ...draft, firstRunCompleted: true };
    await saveWorkspacePrefs(saved);
    onSave(saved);
    onClose();
  };

  const handleSkip = async () => {
    const all: WorkspacePrefs = {
      firstRunCompleted: true,
      visibleDrives: drives.map(d => d.id),
      visibleGroups: teams.map(t => t.id),
      visibleDMs: contacts.map(c => c.user_id),
      performanceMode: false,
    };
    await saveWorkspacePrefs(all);
    onSave(all);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4" onClick={mode === 'settings' ? onClose : undefined}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-telegram-border bg-telegram-surface shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-telegram-border p-4">
          <div>
            <h3 className="text-base font-semibold text-telegram-text">
              {mode === 'setup' ? 'Choose What To Display' : 'Workspace Visibility'}
            </h3>
            <p className="text-xs text-telegram-subtext mt-0.5">
              {mode === 'setup'
                ? 'Select the drives, groups, and conversations you want visible in your workspace. You can change this later in Settings.'
                : 'Manage which items appear in your sidebar.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-telegram-border p-4">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-telegram-subtext" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search drives, groups or people"
              className="w-full rounded-xl border border-telegram-border bg-telegram-hover py-2 pl-9 pr-3 text-sm text-telegram-text outline-none focus:border-telegram-primary"
            />
          </div>

          <button
            onClick={() => setDraft(prev => ({ ...prev, performanceMode: !prev.performanceMode }))}
            className="mb-3 flex w-full items-center gap-3 rounded-xl border border-telegram-primary/20 bg-telegram-primary/5 px-3 py-3 text-left hover:bg-telegram-primary/10 transition-colors"
          >
            <div className={`flex h-5 w-10 items-center rounded-full px-1 transition-colors ${draft.performanceMode ? 'bg-telegram-primary' : 'bg-telegram-subtext'}`}>
              <div className={`h-3 w-3 rounded-full bg-white transition-transform ${draft.performanceMode ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-telegram-text">Selective Sync (Performance Mode)</p>
              <p className="text-[10px] text-telegram-subtext leading-tight">
                Only load data for selected items. Speeds up app startup and reduces memory usage.
              </p>
            </div>
          </button>

          {draft.performanceMode && (
            <button
              onClick={toggleAll}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-telegram-hover transition-colors"
            >
              <Checkbox checked={allSelected} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-telegram-text">Select All</p>
                <p className="text-xs text-telegram-subtext">Show or hide all items</p>
              </div>
            </button>
          )}
        </div>

        <div className="max-h-[420px] overflow-y-auto p-3 custom-scrollbar">
          {filteredDrives.length > 0 && (
            <>
              <SectionHeader label="Drives" count={filteredDrives.length} />
              {filteredDrives.map(drive => {
                const checked = !draft.performanceMode || draft.visibleDrives.includes(drive.id);
                return (
                  <button
                    key={drive.id}
                    onClick={() => draft.performanceMode && toggleDrive(drive.id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                      draft.performanceMode ? 'hover:bg-telegram-hover cursor-pointer' : 'cursor-default opacity-80'
                    }`}
                  >
                    {draft.performanceMode ? (
                      <Checkbox checked={checked} />
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center rounded border border-telegram-border bg-telegram-hover">
                        <Check className="h-3.5 w-3.5 text-telegram-subtext/40" />
                      </span>
                    )}
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

          <SectionHeader label="Groups" count={filteredTeams.length} />
          {filteredTeams.map(team => {
            const checked = !draft.performanceMode || draft.visibleGroups.includes(team.id);
            return (
              <button
                key={team.id}
                onClick={() => draft.performanceMode && toggleTeam(team.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                  draft.performanceMode ? 'hover:bg-telegram-hover cursor-pointer' : 'cursor-default opacity-80'
                }`}
              >
                {draft.performanceMode ? (
                  <Checkbox checked={checked} />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded border border-telegram-border bg-telegram-hover">
                    <Check className="h-3.5 w-3.5 text-telegram-subtext/40" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-telegram-text">{team.name}</p>
                  <p className="truncate text-xs text-telegram-subtext">
                    {team.member_count} members{team.username ? ` • @${team.username}` : ''}
                  </p>
                </div>
              </button>
            );
          })}

          <SectionHeader label="Direct Messages" count={filteredContacts.length} />
          {filteredContacts.map(contact => {
            const checked = !draft.performanceMode || draft.visibleDMs.includes(contact.user_id);
            return (
              <button
                key={contact.user_id}
                onClick={() => draft.performanceMode && toggleDM(contact.user_id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
                  draft.performanceMode ? 'hover:bg-telegram-hover cursor-pointer' : 'cursor-default opacity-80'
                }`}
              >
                {draft.performanceMode ? (
                  <Checkbox checked={checked} />
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded border border-telegram-border bg-telegram-hover">
                    <Check className="h-3.5 w-3.5 text-telegram-subtext/40" />
                  </span>
                )}
                <TelegramAvatar user={contact} token={streamToken} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-telegram-text">
                    {contact.first_name} {contact.last_name || ''}
                  </p>
                  <p className="truncate text-xs text-telegram-subtext">
                    {contact.username ? `@${contact.username}` : contact.phone || 'Telegram contact'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-telegram-border p-4">
          {mode === 'setup' && (
            <button
              onClick={handleSkip}
              className="rounded-lg px-4 py-2 text-sm font-medium text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors"
            >
              Skip (show everything)
            </button>
          )}
          <button
            onClick={handleSave}
            className="rounded-lg bg-telegram-primary px-5 py-2 text-sm font-semibold text-white hover:bg-telegram-primary/90 transition-colors"
          >
            {mode === 'setup' ? 'Save & Continue' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-telegram-subtext">
      {label} ({count})
    </div>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
        checked
          ? 'border-telegram-primary bg-telegram-primary text-white'
          : 'border-telegram-border bg-telegram-hover text-transparent'
      }`}
    >
      <Check className="h-3.5 w-3.5" />
    </span>
  );
}
