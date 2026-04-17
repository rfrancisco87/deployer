import { app, Notification } from "electron";
import { openUrl } from "./open-url";

const REPO = "rfrancisco87/deployer";
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 30_000;

export interface UpdateInfo {
  currentVersion: string;
  latestVersion?: string;
  available: boolean;
  releaseUrl?: string;
  checkedAt?: number;
  error?: string;
}

let lastInfo: UpdateInfo = {
  currentVersion: app.getVersion(),
  available: false,
};
let timer: NodeJS.Timeout | null = null;
let notifiedForVersion: string | null = null;

export function getLastUpdateInfo(): UpdateInfo {
  return lastInfo;
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const current = app.getVersion();
  try {
    const res = await fetch(RELEASES_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `Deployer/${current}`,
      },
    });
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    const data = (await res.json()) as {
      tag_name?: string;
      html_url?: string;
      draft?: boolean;
      prerelease?: boolean;
    };
    if (!data.tag_name || !data.html_url) {
      throw new Error("Release payload missing tag_name or html_url");
    }
    if (data.draft || data.prerelease) {
      // Ignore drafts/prereleases from the "latest" endpoint.
      lastInfo = {
        currentVersion: current,
        available: false,
        checkedAt: Date.now(),
      };
      return lastInfo;
    }
    const latest = data.tag_name.replace(/^v/, "");
    const available = isNewer(current, latest);
    lastInfo = {
      currentVersion: current,
      latestVersion: latest,
      available,
      releaseUrl: data.html_url,
      checkedAt: Date.now(),
    };
    if (available && notifiedForVersion !== latest) {
      notifiedForVersion = latest;
      postUpdateNotification(latest, data.html_url);
    }
    console.log(
      `[deployer] update check: current=${current} latest=${latest} available=${available}`,
    );
    return lastInfo;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    lastInfo = {
      currentVersion: current,
      available: false,
      checkedAt: Date.now(),
      error: message,
    };
    console.error("[deployer] update check failed:", message);
    return lastInfo;
  }
}

function postUpdateNotification(version: string, url: string): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: `Deployer ${version} is available`,
    body: "Click to open the release page and download the new build.",
    silent: false,
  });
  n.on("click", () => {
    void openUrl(url);
  });
  n.show();
}

/** `latest > current` — naive-but-safe-enough semver compare (major.minor.patch). */
function isNewer(current: string, latest: string): boolean {
  const a = parse(current);
  const b = parse(latest);
  for (let i = 0; i < 3; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    if (bi > ai) return true;
    if (bi < ai) return false;
  }
  return false;
}

function parse(v: string): number[] {
  return v
    .replace(/^v/, "")
    .split(/[.\-+]/)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n));
}

export function startUpdateChecker(): void {
  // Delay first check so it doesn't compete with the initial monitor tick.
  setTimeout(() => {
    void checkForUpdate();
    timer = setInterval(() => {
      void checkForUpdate();
    }, CHECK_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
}

export function stopUpdateChecker(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
