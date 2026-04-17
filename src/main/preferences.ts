import { app } from "electron";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

export interface Preferences {
  pollIntervalSeconds: number;
  watchedProjectIds: string[];
  launchAtLogin: boolean;
  /** Auto-dismiss delay for the mini notification card. 0 = persistent. */
  notificationDurationSeconds: number;
}

const DEFAULTS: Preferences = {
  pollIntervalSeconds: 45,
  watchedProjectIds: [],
  launchAtLogin: false,
  notificationDurationSeconds: 30,
};

let cache: Preferences | null = null;
let filePath: string | null = null;

function getFilePath(): string {
  if (filePath) return filePath;
  const dir = app.getPath("userData");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  filePath = path.join(dir, "preferences.json");
  return filePath;
}

export function loadPreferences(): Preferences {
  if (cache) return cache;
  const fp = getFilePath();
  if (!existsSync(fp)) {
    cache = { ...DEFAULTS };
    return cache;
  }
  try {
    const raw = readFileSync(fp, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    cache = { ...DEFAULTS, ...parsed };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

export function getPreferences(): Preferences {
  return loadPreferences();
}

export function savePreferences(patch: Partial<Preferences>): Preferences {
  const current = loadPreferences();
  cache = { ...current, ...patch };
  try {
    writeFileSync(getFilePath(), JSON.stringify(cache, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save preferences", err);
  }
  return cache;
}
