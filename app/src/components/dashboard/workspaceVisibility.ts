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
  if (cached) {
    console.log('[WorkspacePrefs] loadWorkspacePrefs — returning cached copy');
    return cached;
  }
  const t = performance.now();
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
      console.log('[WorkspacePrefs] loadWorkspacePrefs — loaded from store in', (performance.now() - t).toFixed(1) + 'ms', 'performanceMode:', cached.performanceMode, 'drives:', cached.visibleDrives.length, 'groups:', cached.visibleGroups.length, 'dms:', cached.visibleDMs.length);
      return cached;
    }
    console.log('[WorkspacePrefs] loadWorkspacePrefs — no prefs in store, returning defaults');
  } catch (e) {
    console.warn('[WorkspacePrefs] loadWorkspacePrefs — error:', e);
  }
  return defaultPrefs;
}

export async function saveWorkspacePrefs(prefs: WorkspacePrefs): Promise<void> {
  const t = performance.now();
  console.log('[WorkspacePrefs] saveWorkspacePrefs — saving', 'performanceMode:', prefs.performanceMode, 'drives:', prefs.visibleDrives.length, 'groups:', prefs.visibleGroups.length, 'dms:', prefs.visibleDMs.length);
  cached = { ...prefs };
  try {
    const store = await load(STORE_FILE);
    await store.set("prefs", prefs);
    await store.save();
    console.log('[WorkspacePrefs] saveWorkspacePrefs — saved in', (performance.now() - t).toFixed(1) + 'ms');
  } catch (e) {
    console.warn('[WorkspacePrefs] saveWorkspacePrefs — error:', e);
  }
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
