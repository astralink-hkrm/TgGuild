interface SystemMessageProps {
    text: string;
    actionParams?: string | null;
    onJumpToPinned?: (messageId: number) => void;
}

export function SystemMessage({ text, actionParams, onJumpToPinned }: SystemMessageProps) {
    const isPinEvent = actionParams && onJumpToPinned;

    return (
        <div className="flex justify-center my-3">
            <div
                className={`flex items-center gap-1.5 px-4 py-2 text-xs text-telegram-subtext select-none ${
                    isPinEvent
                        ? 'cursor-pointer hover:text-telegram-primary hover:bg-telegram-hover/50 rounded-lg transition-colors'
                        : ''
                }`}
                onClick={() => {
                    if (isPinEvent) {
                        const pinnedId = parseInt(actionParams, 10);
                        if (!isNaN(pinnedId)) onJumpToPinned(pinnedId);
                    }
                }}
                title={isPinEvent ? 'Jump to pinned message' : undefined}
            >
                <span className="text-center leading-relaxed">{text}</span>
            </div>
        </div>
    );
}
