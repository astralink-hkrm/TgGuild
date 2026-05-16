export const TEAM_VISIBILITY_STORAGE_KEY = 'tgTeams.teamVisibility';
export const TEAM_VISIBILITY_CHANGED_EVENT = 'tgTeams:teamVisibilityChanged';

export interface TeamVisibilitySettings {
    hiddenTeamIds: string[];
    hiddenContactIds: string[];
}

export const defaultTeamVisibility: TeamVisibilitySettings = {
    hiddenTeamIds: [],
    hiddenContactIds: [],
};

export function readTeamVisibility(): TeamVisibilitySettings {
    if (typeof window === 'undefined') return defaultTeamVisibility;

    try {
        const raw = window.localStorage.getItem(TEAM_VISIBILITY_STORAGE_KEY);
        if (!raw) return defaultTeamVisibility;
        const parsed = JSON.parse(raw) as Partial<TeamVisibilitySettings>;

        return {
            hiddenTeamIds: Array.isArray(parsed.hiddenTeamIds) ? parsed.hiddenTeamIds.map(String) : [],
            hiddenContactIds: Array.isArray(parsed.hiddenContactIds) ? parsed.hiddenContactIds.map(String) : [],
        };
    } catch {
        return defaultTeamVisibility;
    }
}

export function saveTeamVisibility(settings: TeamVisibilitySettings) {
    window.localStorage.setItem(TEAM_VISIBILITY_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent(TEAM_VISIBILITY_CHANGED_EVENT, { detail: settings }));
}

export function isTeamVisible(id: string | number, settings: TeamVisibilitySettings) {
    return !settings.hiddenTeamIds.includes(String(id));
}

export function isContactVisible(id: string | number, settings: TeamVisibilitySettings) {
    return !settings.hiddenContactIds.includes(String(id));
}
