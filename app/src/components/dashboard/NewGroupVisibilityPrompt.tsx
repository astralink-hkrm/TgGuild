import { Eye, EyeOff } from 'lucide-react';

interface NewGroupVisibilityPromptProps {
    groupName: string;
    onShow: () => void;
    onHide: () => void;
}

/**
 * Shown after joining a group when workspace performanceMode or selective sync
 * is enabled. Asks whether the newly joined group should appear in the sidebar.
 */
export function NewGroupVisibilityPrompt({ groupName, onShow, onHide }: NewGroupVisibilityPromptProps) {
    return (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl">
                <div className="p-5 space-y-4">
                    <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-telegram-text">
                            You joined a new group
                        </h3>
                        <p className="text-xs text-telegram-subtext">
                            Would you like <span className="text-telegram-text font-medium">{groupName}</span> to appear in your sidebar?
                        </p>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={onHide}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-telegram-border bg-telegram-hover px-4 py-2.5 text-sm font-medium text-telegram-subtext hover:text-telegram-text transition-colors"
                        >
                            <EyeOff className="h-4 w-4" />
                            Hide
                        </button>
                        <button
                            onClick={onShow}
                            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-telegram-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-telegram-primary/90 transition-colors"
                        >
                            <Eye className="h-4 w-4" />
                            Show
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
