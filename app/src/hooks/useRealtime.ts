import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface ReactionData {
    emoji: string;
    count: number;
    chosen: boolean;
    reactors: string[];
}

export interface TypingUserData {
    user_id: number;
    user_name: string;
    action: string;
}

export interface ReadStatusData {
    is_read: boolean;
    read_count: number;
    total_count: number;
    readers: { user_id: number; user_name: string; read_at: string }[];
}

export interface PresenceData {
    user_id: number;
    online: boolean;
    last_seen: string | null;
}

const REACTION_POLL_INTERVAL = 10000;
const TYPING_POLL_INTERVAL = 3000;
const TYPING_DEBOUNCE_MS = 2000;
const TYPING_INACTIVITY_MS = 5000;

export function useRealtime(groupId: number | null, isDirect: boolean) {
    const peerKey = groupId === null ? 'self' : String(groupId);

    // Reactions state
    const [reactions, setReactions] = useState<Record<string, ReactionData[]>>(() => {
        try {
            const raw = window.localStorage.getItem(`tgguild.reactions.v2.${peerKey}`);
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    });

    // Typing state
    const [typingUsers, setTypingUsers] = useState<TypingUserData[]>([]);
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastTypingSentRef = useRef<number>(0);
    const typingEnabledRef = useRef(false);

    // Read receipts state
    const [readStatuses, setReadStatuses] = useState<Record<number, ReadStatusData>>({});
    const lastReadMarkedRef = useRef<number>(0);

    // Presence state
    const [presence, setPresence] = useState<Record<string, PresenceData>>({});

    // Sync reactions to localStorage
    useEffect(() => {
        try {
            window.localStorage.setItem(`tgguild.reactions.v2.${peerKey}`, JSON.stringify(reactions));
        } catch {}
    }, [reactions, peerKey]);

    // ========================
    // REACTIONS
    // ========================

    const toggleReaction = useCallback(async (messageId: number, emoji: string) => {
        const key = String(messageId);
        const current = reactions[key] || [];
        const existing = current.find(r => r.emoji === emoji);

        let next: ReactionData[];
        if (existing?.chosen) {
            next = current.filter(r => r.emoji !== emoji);
        } else {
            const updated = existing
                ? current.map(r => r.emoji === emoji ? { ...r, chosen: true, count: r.count + 1 } : r)
                : [...current, { emoji, count: 1, chosen: true, reactors: [] }];
            next = updated;
        }

        setReactions(prev => ({ ...prev, [key]: next }));

        try {
            await invoke('cmd_send_reaction', {
                teamId: groupId,
                messageId,
                emoji: existing?.chosen ? null : emoji,
            });
        } catch (e) {
            console.error('Failed to send reaction:', e);
        }
    }, [reactions, groupId]);

    const fetchReactions = useCallback(async () => {
        if (!groupId) return;
        try {
            const messageIds = Object.keys(reactions).map(Number).filter(id => id > 0);
            if (messageIds.length === 0) return;
            const result = await invoke<{ reactions: Record<string, ReactionData[]> }>('cmd_get_message_reactions', {
                teamId: groupId,
                messageIds,
            });
            if (result?.reactions) {
                setReactions(prev => {
                    const next = { ...prev };
                    for (const [msgIdStr, serverReactions] of Object.entries(result.reactions)) {
                        if (serverReactions.length > 0) {
                            next[msgIdStr] = serverReactions;
                        }
                    }
                    return next;
                });
            }
        } catch (e) {
            console.debug('Failed to fetch reactions:', e);
        }
    }, [groupId, reactions]);

    useEffect(() => {
        if (!groupId) return;
        const timer = setInterval(fetchReactions, REACTION_POLL_INTERVAL);
        return () => clearInterval(timer);
    }, [groupId, fetchReactions]);

    // ========================
    // TYPING INDICATORS
    // ========================

    const sendTyping = useCallback((isTyping: boolean) => {
        if (!groupId) return;
        const now = Date.now();

        if (isTyping) {
            if (now - lastTypingSentRef.current < TYPING_DEBOUNCE_MS) {
                typingEnabledRef.current = true;
                return;
            }
            lastTypingSentRef.current = now;
            typingEnabledRef.current = true;
        } else {
            typingEnabledRef.current = false;
        }

        invoke('cmd_set_typing', { teamId: groupId, typing: isTyping })
            .catch(e => console.debug('Failed to set typing:', e));
    }, [groupId]);

    const handleInputChange = useCallback(() => {
        if (!typingEnabledRef.current) {
            sendTyping(true);
        }

        if (typingTimerRef.current) {
            clearTimeout(typingTimerRef.current);
        }

        typingTimerRef.current = setTimeout(() => {
            sendTyping(false);
            typingEnabledRef.current = false;
        }, TYPING_INACTIVITY_MS);
    }, [sendTyping]);

    const fetchTypingStatus = useCallback(async () => {
        if (!groupId) return;
        try {
            const result = await invoke<TypingUserData[]>('cmd_get_typing_status', {
                teamId: groupId,
            });
            setTypingUsers(result || []);
        } catch (e) {
            console.debug('Failed to fetch typing status:', e);
        }
    }, [groupId]);

    useEffect(() => {
        if (!groupId) return;
        const timer = setInterval(fetchTypingStatus, TYPING_POLL_INTERVAL);
        return () => clearInterval(timer);
    }, [groupId, fetchTypingStatus]);

    // Clean up typing on unmount
    useEffect(() => {
        return () => {
            if (typingTimerRef.current) {
                clearTimeout(typingTimerRef.current);
            }
            if (typingEnabledRef.current && groupId) {
                invoke('cmd_set_typing', { teamId: groupId, typing: false }).catch(() => {});
            }
        };
    }, [groupId]);

    // ========================
    // READ RECEIPTS
    // ========================

    const markAsRead = useCallback(async (maxMessageId: number) => {
        if (!groupId || maxMessageId <= lastReadMarkedRef.current) return;
        lastReadMarkedRef.current = maxMessageId;
        try {
            await invoke('cmd_mark_read', {
                teamId: groupId,
                maxMessageId,
            });
        } catch (e) {
            console.debug('Failed to mark as read:', e);
        }
    }, [groupId]);

    const fetchReadStatus = useCallback(async (messageId: number) => {
        if (!groupId || messageId <= 0) return;
        try {
            const result = await invoke<ReadStatusData>('cmd_get_message_read_status', {
                teamId: groupId,
                messageId,
            });
            if (result) {
                setReadStatuses(prev => ({ ...prev, [messageId]: result }));
            }
        } catch (e) {
            console.debug('Failed to fetch read status:', e);
        }
    }, [groupId]);

    // ========================
    // ONLINE PRESENCE
    // ========================

    const updatePresence = useCallback(async (online: boolean) => {
        try {
            await invoke('cmd_update_presence', { online });
        } catch (e) {
            console.debug('Failed to update presence:', e);
        }
    }, []);

    const fetchPresence = useCallback(async (userIds: number[]) => {
        if (userIds.length === 0) return;
        try {
            const result = await invoke<PresenceData[]>('cmd_get_user_presence', {
                userIds,
            });
            if (result) {
                setPresence(prev => {
                    const next = { ...prev };
                    for (const p of result) {
                        next[String(p.user_id)] = p;
                    }
                    return next;
                });
            }
        } catch (e) {
            console.debug('Failed to fetch presence:', e);
        }
    }, []);

    // Set online when component mounts, offline when it unmounts
    useEffect(() => {
        updatePresence(true);
        return () => {
            updatePresence(false);
        };
    }, [updatePresence]);

    // Handle app visibility changes
    useEffect(() => {
        const handleVisibility = () => {
            updatePresence(!document.hidden);
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, [updatePresence]);

    const getTypingText = useCallback((): string | null => {
        if (typingUsers.length === 0) return null;
        const first = typingUsers[0];
        if (isDirect) {
            return `${first.user_name} is typing...`;
        }
        if (typingUsers.length === 1) {
            return `${first.user_name} is typing...`;
        }
        const others = typingUsers.length - 1;
        return `${first.user_name} and ${others} other${others > 1 ? 's' : ''} are typing...`;
    }, [typingUsers, isDirect]);

    const formatLastSeen = useCallback((presenceData: PresenceData | undefined): string | null => {
        if (!presenceData) return null;
        if (presenceData.online) return 'online';
        if (presenceData.last_seen === 'recently') return 'last seen recently';
        if (presenceData.last_seen === 'last week') return 'last seen last week';
        if (presenceData.last_seen === 'last month') return 'last seen last month';
        if (presenceData.last_seen) {
            const date = new Date(presenceData.last_seen);
            if (!isNaN(date.getTime())) {
                return `last seen ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            }
            return `last seen ${presenceData.last_seen}`;
        }
        return null;
    }, []);

    return {
        // Reactions
        reactions,
        setReactions,
        toggleReaction,
        fetchReactions,

        // Typing
        typingUsers,
        typingText: getTypingText(),
        sendTyping,
        handleInputChange,

        // Read receipts
        readStatuses,
        markAsRead,
        fetchReadStatus,

        // Presence
        presence,
        updatePresence,
        fetchPresence,
        formatLastSeen,
    };
}
