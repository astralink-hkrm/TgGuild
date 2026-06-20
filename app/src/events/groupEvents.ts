/**
 * Custom DOM events for group membership changes.
 * These are fired after successful group joins and consumed by
 * Sidebar, TeamsPanel, and Dashboard to update their state without
 * requiring a full page refresh.
 */

export const GROUP_JOINED_EVENT = 'tgguild:group_joined';

export interface GroupJoinedEventDetail {
    /** Telegram group ID */
    groupId: number;
    /** Display name of the joined group */
    groupName: string;
}

/**
 * Dispatch a group_joined event so all interested components can update.
 * This replaces the need for a hard page refresh after joining a group.
 */
export function dispatchGroupJoined(groupId: number, groupName: string): void {
    window.dispatchEvent(
        new CustomEvent<GroupJoinedEventDetail>(GROUP_JOINED_EVENT, {
            detail: { groupId, groupName },
        })
    );
}
