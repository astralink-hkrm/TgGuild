const DIRECTORY_CACHE_KEY = 'tgguild.telegramDirectory.v1';
const MESSAGE_CACHE_PREFIX = 'tgguild.telegramMessages.v1.';
const MAX_CACHED_MESSAGES = 250;

interface DirectoryCache<TTeam, TContact> {
    currentUserId: string | null;
    teams: TTeam[];
    contacts: TContact[];
    cachedAt: number;
}

interface MessageCache<TMessage> {
    peerKey: string;
    messages: TMessage[];
    nextBeforeMessageId: number | null;
    hasMore: boolean;
    cachedAt: number;
}

function canUseStorage() {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function readTelegramDirectoryCache<TTeam, TContact>(
    currentUserId?: string | null,
): DirectoryCache<TTeam, TContact> | null {
    if (!canUseStorage()) return null;

    try {
        const raw = window.localStorage.getItem(DIRECTORY_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as DirectoryCache<TTeam, TContact>;
        if (currentUserId !== undefined && parsed.currentUserId !== currentUserId) {
            return null;
        }
        if (!Array.isArray(parsed.teams) || !Array.isArray(parsed.contacts)) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function saveTelegramDirectoryCache<TTeam, TContact>(
    currentUserId: string | null,
    teams: TTeam[],
    contacts: TContact[],
) {
    if (!canUseStorage()) return;

    try {
        const payload: DirectoryCache<TTeam, TContact> = {
            currentUserId,
            teams,
            contacts,
            cachedAt: Date.now(),
        };
        window.localStorage.setItem(DIRECTORY_CACHE_KEY, JSON.stringify(payload));
    } catch {
        // Cache failures should never block the Telegram UI.
    }
}

export function readTelegramMessageCache<TMessage>(
    peerKey: string,
): MessageCache<TMessage> | null {
    if (!canUseStorage()) return null;

    try {
        const raw = window.localStorage.getItem(`${MESSAGE_CACHE_PREFIX}${peerKey}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as MessageCache<TMessage>;
        if (parsed.peerKey !== peerKey || !Array.isArray(parsed.messages)) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function saveTelegramMessageCache<TMessage extends { pending?: boolean }>(
    peerKey: string,
    messages: TMessage[],
    nextBeforeMessageId: number | null,
    hasMore: boolean,
) {
    if (!canUseStorage()) return;

    try {
        const stableMessages = messages
            .filter((message) => !message.pending)
            .slice(-MAX_CACHED_MESSAGES);
        const payload: MessageCache<TMessage> = {
            peerKey,
            messages: stableMessages,
            nextBeforeMessageId,
            hasMore,
            cachedAt: Date.now(),
        };
        window.localStorage.setItem(`${MESSAGE_CACHE_PREFIX}${peerKey}`, JSON.stringify(payload));
    } catch {
        // Cache failures should never block message rendering.
    }
}
