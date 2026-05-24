import { LayoutGrid, Sun, Moon, Plus } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { MemberStack } from './MemberStack';

interface TopBarProps {
    currentFolderName: string;
    viewMode: 'grid' | 'list';
    setViewMode: (mode: 'grid' | 'list') => void;
    searchTerm: string;
    onSearchChange: (term: string) => void;
    members?: any[];
    onAddSubscriber?: () => void;
}

export function TopBar({
    currentFolderName,
    viewMode, setViewMode, searchTerm, onSearchChange, members = [],
    onAddSubscriber
}: TopBarProps) {
    const { theme, toggleTheme } = useTheme();

    return (
        <header className="h-14 border-b border-telegram-border flex items-center px-4 justify-between bg-telegram-surface/80 backdrop-blur-md sticky top-0 z-10" onClick={e => e.stopPropagation()}>
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
                {(members.length > 0 || onAddSubscriber) && (
                    <div className="flex items-center gap-2">
                        <MemberStack members={members} size="sm" />
                        {onAddSubscriber && (
                            <button
                                onClick={onAddSubscriber}
                                className="w-8 h-8 rounded-full bg-telegram-primary/10 hover:bg-telegram-primary/20 text-telegram-primary flex items-center justify-center transition-all shadow-sm active:scale-95"
                                title="Add Subscriber"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        )}
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
}
