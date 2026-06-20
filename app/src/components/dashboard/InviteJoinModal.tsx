import { useState } from 'react';
import { X, Users, Loader2, CheckCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import {
    loadWorkspacePrefs,
    saveWorkspacePrefs,
    WorkspacePrefs,
} from './workspaceVisibility';
import {
    readTeamVisibility,
    saveTeamVisibility,
    TeamVisibilitySettings,
} from './teamVisibility';
import { saveTelegramDirectoryCache, readTelegramDirectoryCache } from './telegramCache';
import { dispatchGroupJoined } from '../../events/groupEvents';

interface InviteGroupInfo {
    group_name: string;
    member_count: number;
    is_channel: boolean;
    is_supergroup: boolean;
    invite_hash: string;
}

type JoinStatus = 'preview' | 'joining' | 'success';

interface InviteJoinModalProps {
    inviteUrl: string;
    groupInfo: InviteGroupInfo;
    onClose: () => void;
    /** Called with the numeric group ID once the user successfully joins */
    onJoined: (groupId: number, groupName: string) => void;
    /** Called when performanceMode is on after join — needs visibility decision */
    onNeedsVisibilityDecision?: (groupId: number, groupName: string) => void;
}

export function InviteJoinModal({ inviteUrl: _inviteUrl, groupInfo, onClose, onJoined, onNeedsVisibilityDecision }: InviteJoinModalProps) {
    const [status, setStatus] = useState<JoinStatus>('preview');
    const [_joinedGroupId, setJoinedGroupId] = useState<number>(0);

    const groupType = groupInfo.is_channel
        ? groupInfo.is_supergroup ? 'Supergroup' : 'Channel'
        : groupInfo.is_supergroup ? 'Supergroup' : 'Group';

    const handleJoin = async () => {
        setStatus('joining');
        try {
            const groupId = await invoke<number>('cmd_join_group_by_invite', {
                inviteHash: groupInfo.invite_hash,
            });

            setJoinedGroupId(groupId);

            // Check if workspace performanceMode is enabled BEFORE ensuring visibility
            const prefs: WorkspacePrefs = await loadWorkspacePrefs().catch(() => ({
                firstRunCompleted: false,
                visibleDrives: [],
                visibleGroups: [],
                visibleDMs: [],
                performanceMode: false,
            }));

            const needsVisibilityChoice = prefs.performanceMode && !prefs.visibleGroups.includes(groupId);

            // Ensure the newly joined group appears regardless of visibility settings
            await ensureGroupVisible(groupId, groupInfo.group_name);

            // Broadcast realtime event so sidebar / panels refresh without reload
            dispatchGroupJoined(groupId, groupInfo.group_name);

            setStatus('success');

            // Auto-advance to group after brief success display
            setTimeout(() => {
                if (needsVisibilityChoice && onNeedsVisibilityDecision) {
                    // Close join modal first, then ask about visibility
                    onNeedsVisibilityDecision(groupId, groupInfo.group_name);
                } else {
                    onJoined(groupId, groupInfo.group_name);
                }
                onClose();
            }, 1200);
        } catch (e) {
            toast.error(`Failed to join group: ${e}`);
            setStatus('preview');
        }
    };

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={(e) => {
                if (status !== 'joining') onClose();
                e.stopPropagation();
            }}
        >
            <div
                className="w-full max-w-sm overflow-hidden rounded-2xl border border-telegram-border bg-telegram-surface shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-telegram-border p-4">
                    <h3 className="text-base font-semibold text-telegram-text">
                        {status === 'success' ? 'Joined!' : 'Join Group'}
                    </h3>
                    {status !== 'joining' && (
                        <button
                            onClick={onClose}
                            className="rounded-full p-1.5 text-telegram-subtext hover:bg-telegram-hover hover:text-telegram-text transition-colors"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">
                    {status === 'success' ? (
                        <div className="flex flex-col items-center gap-3 py-4">
                            <CheckCircle className="h-12 w-12 text-green-500" />
                            <p className="text-center text-sm font-medium text-telegram-text">
                                Successfully joined {groupInfo.group_name}
                            </p>
                            <p className="text-xs text-telegram-subtext">Opening group...</p>
                        </div>
                    ) : (
                        <>
                            {/* Group info */}
                            <div className="flex items-center gap-4 rounded-xl bg-telegram-hover/50 p-4">
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-telegram-primary/10 text-telegram-primary flex-shrink-0">
                                    <Users className="h-6 w-6" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-telegram-text truncate">
                                        {groupInfo.group_name}
                                    </p>
                                    <p className="text-xs text-telegram-subtext">
                                        {groupInfo.member_count.toLocaleString()} member{groupInfo.member_count !== 1 ? 's' : ''}
                                        {' · '}
                                        {groupType}
                                    </p>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    disabled={status === 'joining'}
                                    className="flex-1 rounded-xl border border-telegram-border bg-telegram-hover px-4 py-2.5 text-sm font-medium text-telegram-subtext hover:text-telegram-text transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleJoin}
                                    disabled={status === 'joining'}
                                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-telegram-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-telegram-primary/90 transition-colors disabled:opacity-75"
                                >
                                    {status === 'joining' ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                            Joining...
                                        </>
                                    ) : (
                                        'Join'
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Ensures a newly joined group is visible in both visibility systems and
 * updates the directory cache so the sidebar reflects the change immediately.
 */
async function ensureGroupVisible(groupId: number, groupName: string): Promise<void> {
    // 1. teamVisibility (localStorage hide-list) — remove from hidden list if present
    const tv: TeamVisibilitySettings = readTeamVisibility();
    const hiddenIndex = tv.hiddenTeamIds.indexOf(String(groupId));
    if (hiddenIndex !== -1) {
        const updated: TeamVisibilitySettings = {
            ...tv,
            hiddenTeamIds: tv.hiddenTeamIds.filter(id => id !== String(groupId)),
        };
        saveTeamVisibility(updated);
    }

    // 2. workspaceVisibility (plugin-store performanceMode allowlist) — add if performanceMode is on
    try {
        const prefs: WorkspacePrefs = await loadWorkspacePrefs();
        if (prefs.performanceMode && !prefs.visibleGroups.includes(groupId)) {
            // Ask the user whether to show it (handled in the calling component)
            // We default to showing it so the user lands in the group immediately
            const updated: WorkspacePrefs = {
                ...prefs,
                visibleGroups: [...prefs.visibleGroups, groupId],
            };
            await saveWorkspacePrefs(updated);
        }
    } catch {
        // non-fatal
    }

    // 3. Bust the directory cache so Sidebar/TeamsPanel reload with the new group
    try {
        const cached = readTelegramDirectoryCache<any, any>(null);
        if (cached && Array.isArray(cached.teams)) {
            const alreadyIn = cached.teams.some((t: any) => t.id === groupId);
            if (!alreadyIn) {
                const newTeam = {
                    id: groupId,
                    name: groupName,
                    username: null,
                    member_count: 0,
                    photo_url: null,
                };
                saveTelegramDirectoryCache(cached.currentUserId, [newTeam, ...cached.teams], cached.contacts);
            }
        }
    } catch {
        // non-fatal
    }
}
