import { memo, useState, useMemo, useEffect } from 'react';
import { LayoutGrid, Sun, Moon, Plus, UserPlus, UserMinus, ChevronDown, ChevronUp } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { MemberStack } from './MemberStack';
import { TelegramAvatar } from './TelegramAvatar';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

interface TopBarProps {
    currentFolderName: string;
    viewMode: 'grid' | 'list';
    setViewMode: (mode: 'grid' | 'list') => void;
    searchTerm: string;
    onSearchChange: (term: string) => void;
    members?: any[];
    onAddSubscriber?: () => void;
    canManageMembers?: boolean;
    groupId?: number | null;
}

export const TopBar = memo(function TopBar({
    currentFolderName,
    viewMode, setViewMode, searchTerm, onSearchChange, members: propMembers = [],
    onAddSubscriber, canManageMembers = false, groupId
}: TopBarProps) {
    const { theme, toggleTheme } = useTheme();
    const [showPlusMenu, setShowPlusMenu] = useState(false);
    const [membersExpanded, setMembersExpanded] = useState(false);
    const [streamToken, setStreamToken] = useState<string>('');

    useEffect(() => {
        invoke<string>('cmd_get_stream_token').then(setStreamToken).catch(console.error);
    }, []);

    const sortedMembers = useMemo(() => {
        return [...propMembers].sort((a, b) => 
            (a.first_name || '').localeCompare(b.first_name || '')
        );
    }, [propMembers]);

    const displayedMembers = membersExpanded ? sortedMembers : sortedMembers.slice(0, 3);
    const hasMoreMembers = sortedMembers.length > 3;

    const handleRemoveMember = async (e: React.MouseEvent, member: any) => {
        e.stopPropagation();
        if (!groupId) return;
        try {
            await invoke('cmd_remove_team_member', {
                teamId: groupId,
                userIdStr: String(member.user_id),
                accessHashStr: member.access_hash,
            });
            toast.success(`Removed ${member.first_name}`);
        } catch (e) {
            toast.error(`Failed to remove: ${e}`);
        }
    };

    return (
        <header className="h-14 border-b border-telegram-border flex items-center px-4 justify-between bg-telegram-surface/80 backdrop-blur-md sticky top-0 z-[100]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-4">
                <div className="flex items-center text-sm breadcrumbs text-telegram-subtext select-none">
                    <span className="hover:text-telegram-text cursor-pointer transition-colors">Start</span>
                    <span className="mx-2">/</span>
                    <span className="text-telegram-text font-medium">{currentFolderName}</span>
                </div>
            </div>

            <div className="flex-1 max-w-md mx-4 flex items-center gap-4">
                <div className="relative flex-1">
                    <input
                        type="text"
                        placeholder="Search files..."
                        className="w-full bg-telegram-hover border border-telegram-border rounded-lg px-3 py-1.5 text-sm text-telegram-text placeholder:text-telegram-subtext focus:outline-none focus:border-telegram-primary/50 transition-colors"
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                </div>
                {(sortedMembers.length > 0 || onAddSubscriber) && (
                    <div className="flex items-center gap-2 border-l border-telegram-border pl-4">
                        <MemberStack members={sortedMembers} size="sm" />
                        <div className="relative">
                            <button
                                onClick={() => setShowPlusMenu(!showPlusMenu)}
                                className="w-8 h-8 rounded-full bg-telegram-primary/10 hover:bg-telegram-primary/20 text-telegram-primary flex items-center justify-center transition-all shadow-sm active:scale-95"
                                title="Options"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                            {showPlusMenu && (
                                <div className="absolute right-0 top-full mt-2 w-72 bg-telegram-surface border border-telegram-border rounded-xl shadow-2xl z-[1000] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                    <div className="p-3 border-b border-telegram-border bg-telegram-hover/30 flex items-center justify-between">
                                        <span className="text-xs font-bold text-telegram-subtext uppercase tracking-wider">Members ({sortedMembers.length})</span>
                                        {hasMoreMembers && (
                                            <button
                                                onClick={() => setMembersExpanded(!membersExpanded)}
                                                className="text-[10px] text-telegram-primary hover:underline flex items-center gap-1"
                                            >
                                                {membersExpanded ? <><ChevronUp className="w-3 h-3"/> Less</> : <><ChevronDown className="w-3 h-3"/> More</>}
                                            </button>
                                        )}
                                    </div>
                                    <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                        {displayedMembers.map(member => (
                                            <div key={member.user_id} className="flex items-center gap-3 p-2 hover:bg-telegram-hover transition-colors group">
                                                <TelegramAvatar user={member} token={streamToken} size="sm" />
                                                <span className="flex-1 text-sm text-telegram-text truncate">{member.first_name} {member.last_name || ''}</span>
                                                {canManageMembers && !member.is_owner && (
                                                    <button
                                                        onClick={(e) => handleRemoveMember(e, member)}
                                                        className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-red-400 rounded-md transition-all"
                                                        title="Remove"
                                                    >
                                                        <UserMinus className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                    {onAddSubscriber && canManageMembers && (
                                        <button
                                            onClick={() => {
                                                setShowPlusMenu(false);
                                                onAddSubscriber();
                                            }}
                                            className="w-full flex items-center gap-2 p-3 text-sm text-telegram-primary hover:bg-telegram-primary/10 transition-colors border-t border-telegram-border"
                                        >
                                            <UserPlus className="w-4 h-4" />
                                            Add People
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                    className="p-2 hover:bg-telegram-hover rounded-md text-telegram-subtext hover:text-telegram-text transition relative group"
                    title="Toggle Layout"
                >
                    <LayoutGrid className="w-5 h-5" />
                    <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] bg-telegram-surface border border-telegram-border px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                        {viewMode === 'grid' ? 'Switch to List' : 'Switch to Grid'}
                    </span>
                </button>

                <div className="w-px h-6 bg-telegram-border mx-1"></div>

                <button
                    onClick={toggleTheme}
                    className="p-2 hover:bg-telegram-hover rounded-md text-telegram-subtext hover:text-telegram-text transition relative group"
                    title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                    {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                    <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] bg-telegram-surface border border-telegram-border px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-lg">
                        {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    </span>
                </button>
            </div>
        </header>
    )
});
