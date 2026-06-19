/**
 * useInviteLink — handles tgguild:// deep links and invite.tgguild.app URLs.
 *
 * Deep links arrive via two paths:
 *   1. App already running → Tauri backend emits 'deep-link-received' event
 *   2. App launched by the OS because of a deep link → getCurrent() from the
 *      plugin returns the URL on startup
 *
 * When an invite URL is detected, this hook resolves it (fetches group preview)
 * and surfaces a pending invite that the caller renders as an InviteJoinModal.
 */

import { useState, useEffect, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';

export interface InviteGroupInfo {
    group_name: string;
    member_count: number;
    is_channel: boolean;
    is_supergroup: boolean;
    invite_hash: string;
}

export interface PendingInvite {
    url: string;
    groupInfo: InviteGroupInfo;
}

interface UseInviteLinkReturn {
    pendingInvite: PendingInvite | null;
    clearPendingInvite: () => void;
    /** Manually process an invite URL (e.g. pasted by the user) */
    processInviteUrl: (url: string) => Promise<void>;
}

/** Returns true if the URL looks like a TGGuild or t.me invite */
export function isInviteUrl(url: string): boolean {
    const u = url.trim();
    return (
        u.startsWith('tgguild://join/') ||
        u.startsWith('https://invite.tgguild.app/join/') ||
        /^https?:\/\/t\.me\/\+/.test(u) ||
        /^t\.me\/\+/.test(u)
    );
}

export function useInviteLink(isAuthenticated: boolean): UseInviteLinkReturn {
    const [pendingInvite, setPendingInvite] = useState<PendingInvite | null>(null);
    const [processing, setProcessing] = useState<Set<string>>(new Set());

    const processInviteUrl = useCallback(async (url: string) => {
        if (!isInviteUrl(url)) return;
        if (processing.has(url)) return;

        setProcessing(prev => new Set(prev).add(url));

        try {
            toast.loading('Resolving invite link...', { id: 'invite-resolve' });
            const groupInfo = await invoke<InviteGroupInfo>('cmd_resolve_invite_link', { url });
            toast.dismiss('invite-resolve');
            setPendingInvite({ url, groupInfo });
        } catch (e) {
            toast.dismiss('invite-resolve');
            toast.error(`Invalid invite link: ${e}`);
        } finally {
            setProcessing(prev => {
                const next = new Set(prev);
                next.delete(url);
                return next;
            });
        }
    }, [isAuthenticated, processing]);

    // Listen for deep links while app is running
    useEffect(() => {
        if (!isAuthenticated) return;

        const unlisten = listen<string>('deep-link-received', (event) => {
            const url = event.payload;
            if (url && isInviteUrl(url)) {
                processInviteUrl(url);
            }
        });

        return () => {
            unlisten.then(f => f());
        };
    }, [isAuthenticated, processInviteUrl]);

    // Check for startup deep links (app was launched by OS via tgguild:// URL)
    useEffect(() => {
        if (!isAuthenticated) return;

        const checkStartupDeepLink = async () => {
            try {
                // Dynamic import to avoid errors if the plugin isn't loaded yet
                const { getCurrent } = await import('@tauri-apps/plugin-deep-link');
                const urls = await getCurrent();
                if (urls && urls.length > 0) {
                    for (const url of urls) {
                        const urlStr = url.toString();
                        if (isInviteUrl(urlStr)) {
                            await processInviteUrl(urlStr);
                            break; // Handle first valid invite only
                        }
                    }
                }
            } catch {
                // Plugin not available or no deep link on startup — ignore
            }
        };

        checkStartupDeepLink();
    }, [isAuthenticated]);

    const clearPendingInvite = useCallback(() => {
        setPendingInvite(null);
    }, []);

    return {
        pendingInvite,
        clearPendingInvite,
        processInviteUrl,
    };
}
