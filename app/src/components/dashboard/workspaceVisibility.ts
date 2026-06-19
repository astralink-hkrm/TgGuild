import { load } from "@tauri-apps/plugin-store";

const STORE_FILE = "workspace.json";

export interface WorkspacePrefs {
  firstRunCompleted: boolean;
  visibleDrives: number[];
  visibleGroups: number[];
  visibleDMs: string[];
  performanceMode: boolean;
}

export const defaultPrefs: WorkspacePrefs = {
  firstRunCompleted: false,
  visibleDrives: [],
  visibleGroups: [],
  visibleDMs: [],
  performanceMode: false,
};

let cached: WorkspacePrefs | null = null;

export async function loadWorkspacePrefs(): Promise<WorkspacePrefs> {
  if (cached) return cached;
  try {
    const store = await load(STORE_FILE);
    const raw = await store.get<WorkspacePrefs>("prefs");
    if (raw) {
      cached = {
        firstRunCompleted: !!raw.firstRunCompleted,
        visibleDrives: Array.isArray(raw.visibleDrives) ? raw.visibleDrives.map(Number) : [],
        visibleGroups: Array.isArray(raw.visibleGroups) ? raw.visibleGroups.map(Number) : [],
        visibleDMs: Array.isArray(raw.visibleDMs) ? raw.visibleDMs.map(String) : [],
        performanceMode: !!raw.performanceMode,
      };
      return cached;
    }
  } catch { /* ignore */ }
  return defaultPrefs;
}

export async function saveWorkspacePrefs(prefs: WorkspacePrefs): Promise<void> {
  cached = { ...prefs };
  try {
    const store = await load(STORE_FILE);
    await store.set("prefs", prefs);
    await store.save();
  } catch { /* ignore */ }
}

export function isGroupVisible(id: number, prefs: WorkspacePrefs): boolean {
  if (!prefs.performanceMode) return true;
  return prefs.visibleGroups.includes(id);
}

export function isDriveVisible(id: number, prefs: WorkspacePrefs): boolean {
  if (!prefs.performanceMode) return true;
  return prefs.visibleDrives.includes(id);
}

export function isDMVisible(id: string, prefs: WorkspacePrefs): boolean {
  if (!prefs.performanceMode) return true;
  return prefs.visibleDMs.includes(id);
}
