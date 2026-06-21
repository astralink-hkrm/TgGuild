import { useMemo, useState, useRef, useEffect } from 'react';
import { Check, HardDrive, Search, Users, X } from 'lucide-react';
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
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== 'settings') return;
    const handler = (e: MouseEvent) => {
      if (overlayRef.current && e.target === overlayRef.current) onClose();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [mode, onClose]);

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

  const content = (
    <>
      {/* Fixed Header */}
      <div className="flex items-start justify-between gap-4 px-8 pt-5 pb-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-telegram-text leading-snug">
            {mode === 'setup' ? 'Choose What To Display' : 'Workspace Visibility'}
          </h2>
          <p className="text-xs text-telegram-subtext mt-1 leading-relaxed">
            {mode === 'setup'
              ? 'Select the drives, groups, and conversations you want visible in your workspace.'
              : 'Manage which items appear in your sidebar.'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-0.5 rounded-lg p-1.5 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Fixed Controls */}
      <div className="px-8 pb-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-telegram-subtext" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search drives, groups or people"
            className="w-full rounded-lg border border-telegram-border bg-telegram-hover py-2 pl-9 pr-3 text-sm text-telegram-text outline-none placeholder:text-telegram-subtext/60 focus:border-telegram-primary/50 focus:bg-telegram-bg transition-colors"
          />
        </div>

        <button
          onClick={() => setDraft(prev => ({ ...prev, performanceMode: !prev.performanceMode }))}
          className="flex w-full items-center gap-3 rounded-lg border border-telegram-border bg-telegram-hover/30 px-3 py-2 text-left hover:bg-telegram-hover/60 transition-colors"
        >
          <div className={`flex h-4 w-8 shrink-0 items-center rounded-full px-0.5 transition-colors ${draft.performanceMode ? 'bg-telegram-primary' : 'bg-telegram-subtext/40'}`}>
            <div className={`h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${draft.performanceMode ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-telegram-text">Selective Sync (Performance Mode)</p>
            <p className="text-[11px] text-telegram-subtext/80 leading-relaxed mt-0.5">
              Only load data for selected items. Speeds up app startup and reduces memory usage.
            </p>
          </div>
        </button>

        {draft.performanceMode && (
          <button
            onClick={toggleAll}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-telegram-hover transition-colors"
          >
            <Checkbox checked={allSelected} />
            <span className="text-xs font-medium text-telegram-text">
              {allSelected ? 'Deselect All' : 'Select All'}
            </span>
            <span className="text-[11px] text-telegram-subtext/70 ml-1">
              ({filteredDrives.length + filteredTeams.length + filteredContacts.length} items)
            </span>
          </button>
        )}
      </div>

      {/* Separator */}
      <div className="mx-8 border-t border-telegram-border/60" />

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-8 py-2 space-y-2 custom-scrollbar">
        {filteredDrives.length > 0 && (
          <SectionHeader icon={HardDrive} label="Drives" count={filteredDrives.length} />
        )}
        {filteredDrives.map(drive => {
          const checked = !draft.performanceMode || draft.visibleDrives.includes(drive.id);
          return (
            <button
              key={drive.id}
              onClick={() => draft.performanceMode && toggleDrive(drive.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                draft.performanceMode ? 'hover:bg-telegram-hover cursor-pointer' : 'cursor-default opacity-70'
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
                <p className="truncate text-xs text-telegram-subtext mt-0.5">
                  {drive.member_count} members{drive.username ? ` \u2022 @${drive.username}` : ''}
                </p>
              </div>
            </button>
          );
        })}

        {filteredTeams.length > 0 && (
          <>
            <div className="pt-2" />
            <SectionHeader icon={Users} label="Groups" count={filteredTeams.length} />
          </>
        )}
        {filteredTeams.map(team => {
          const checked = !draft.performanceMode || draft.visibleGroups.includes(team.id);
          return (
            <button
              key={team.id}
              onClick={() => draft.performanceMode && toggleTeam(team.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                draft.performanceMode ? 'hover:bg-telegram-hover cursor-pointer' : 'cursor-default opacity-70'
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
                <p className="truncate text-xs text-telegram-subtext mt-0.5">
                  {team.member_count} members{team.username ? ` \u2022 @${team.username}` : ''}
                </p>
              </div>
            </button>
          );
        })}

        {filteredContacts.length > 0 && (
          <>
            <div className="pt-2" />
            <SectionHeader label="Direct Messages" count={filteredContacts.length} />
          </>
        )}
        {filteredContacts.map(contact => {
          const checked = !draft.performanceMode || draft.visibleDMs.includes(contact.user_id);
          return (
            <button
              key={contact.user_id}
              onClick={() => draft.performanceMode && toggleDM(contact.user_id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors ${
                draft.performanceMode ? 'hover:bg-telegram-hover cursor-pointer' : 'cursor-default opacity-70'
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
                <p className="truncate text-xs text-telegram-subtext mt-0.5">
                  {contact.username ? `@${contact.username}` : contact.phone || 'Telegram contact'}
                </p>
              </div>
            </button>
          );
        })}

        <div className="h-1" />
      </div>

      {/* Fixed Footer */}
      <div className="flex items-center justify-end gap-3 px-8 py-3 border-t border-telegram-border/60">
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-medium text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors"
        >
          Cancel
        </button>
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
          className="rounded-lg bg-telegram-primary px-5 py-2 text-sm font-semibold text-white hover:bg-telegram-primary/90 shadow-sm transition-colors"
        >
          {mode === 'setup' ? 'Save & Continue' : 'Save'}
        </button>
      </div>
    </>
  );

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 md:p-8 lg:p-12 backdrop-blur-sm"
      style={{ paddingTop: 'max(48px, 5vh)', paddingBottom: 'max(48px, 5vh)' }}
    >
      <div
        className="flex flex-col w-full bg-telegram-surface shadow-2xl overflow-hidden"
        style={{
          maxWidth: '640px',
          maxHeight: '85vh',
          borderRadius: '20px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.25), 0 8px 20px rgba(0,0,0,0.15)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, label, count }: { icon?: React.ComponentType<{ className?: string }>; label: string; count: number }) {
  return (
    <div
      className="sticky top-0 z-10 flex items-center gap-1.5 px-1 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-telegram-subtext/70 bg-telegram-surface/95 backdrop-blur-sm"
      style={{ margin: 0 }}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {label}{' '}
      <span className="font-normal text-telegram-subtext/50 normal-case tracking-normal">
        ({count})
      </span>
    </div>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all duration-150 ${
        checked
          ? 'border-telegram-primary bg-telegram-primary text-white shadow-sm'
          : 'border-telegram-border bg-telegram-hover text-transparent hover:border-telegram-subtext/40'
      }`}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
    </span>
  );
}
