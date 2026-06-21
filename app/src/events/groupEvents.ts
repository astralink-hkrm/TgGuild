/**
 * Custom DOM events for group membership changes.
 * These are fired after successful group joins and consumed by
 * Sidebar, TeamsPanel, and Dashboard to update their state without
 * requiring a full page refresh.
 */

export const GROUP_JOINED_EVENT = 'tgguild:group_joined';
export const GROUP_LEFT_EVENT = 'tgguild:group_left';

export interface GroupJoinedEventDetail {
    /** Telegram group ID */
    groupId: number;
    /** Display name of the joined group */
    groupName: string;
    /** ID of the member who joined */
    memberId?: string;
    /** Name of the member who joined */
    memberName?: string;
}

export interface GroupLeftEventDetail {
    /** Telegram group ID that was left */
    groupId: number;
}

/**
 * Dispatch a group_joined event so all interested components can update.
 * This replaces the need for a hard page refresh after joining a group.
 */
export function dispatchGroupJoined(
    groupId: number,
    groupName: string,
    memberId?: string,
    memberName?: string,
): void {
    window.dispatchEvent(
        new CustomEvent<GroupJoinedEventDetail>(GROUP_JOINED_EVENT, {
            detail: { groupId, groupName, memberId, memberName },
        })
    );
}

/**
 * Dispatch a group_left event so components can remove the group from UI
 * without requiring a hard page refresh.
 */
export function dispatchGroupLeft(groupId: number): void {
    window.dispatchEvent(
        new CustomEvent<GroupLeftEventDetail>(GROUP_LEFT_EVENT, {
            detail: { groupId },
        })
    );
}
