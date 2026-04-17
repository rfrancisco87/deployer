import {
  app,
  Menu,
  nativeImage,
  type NativeImage,
  Tray,
  type MenuItemConstructorOptions,
} from "electron";
import path from "path";
import {
  buildDurationSeconds,
  type Deployment,
  type DeploymentState,
  type MonitorSnapshot,
  type TransitionEvent,
} from "../shared/types";
import { showMini, hideMini } from "./mini-window";
import type { Monitor } from "./monitor";
import {
  hidePopup,
  showPopup,
  togglePopup,
} from "./popup-window";
import { getPreferences } from "./preferences";
import { openSettingsWindow } from "./settings-window";
import { uiEvents } from "./ui-events";

const HIGHLIGHT_MS = 35_000;

type BadgeName = "plain" | "green" | "red" | "yellow";

interface HighlightState {
  projectName: string;
  to: DeploymentState;
  durationSeconds: number;
  at: number;
}

let tray: Tray | null = null;
let currentSnapshot: MonitorSnapshot = {
  lastCheckedAt: null,
  lastError: null,
  latestByProject: {},
  recentDeployments: [],
  aggregateStatus: "idle",
};
let highlight: HighlightState | null = null;
let ticker: NodeJS.Timeout | null = null;
let acknowledged = false;
const iconCache = new Map<BadgeName, NativeImage>();

function iconFor(name: BadgeName): NativeImage {
  const cached = iconCache.get(name);
  if (cached) return cached;
  const p = path.join(
    __dirname,
    "..",
    "resources",
    "icons",
    `tray-${name}.png`,
  );
  const img = nativeImage.createFromPath(p);
  img.setTemplateImage(false);
  iconCache.set(name, img);
  return img;
}

function badgeFor(snap: MonitorSnapshot, hl: HighlightState | null): BadgeName {
  // Auth problems always show — acknowledgement doesn't dismiss errors
  // the user can't resolve without taking action in Settings.
  if (snap.aggregateStatus === "unauth") return "red";

  // Once the user has looked at the latest result, drop the dot.
  if (acknowledged) return "plain";

  if (hl) {
    if (hl.to === "READY") return "green";
    if (hl.to === "ERROR") return "red";
    if (hl.to === "CANCELED") return "plain";
  }

  switch (snap.aggregateStatus) {
    case "error":
      return "red";
    case "building":
      return "yellow";
    case "ready":
      return "green";
    case "idle":
    default:
      return "plain";
  }
}

export function initTray(monitor: Monitor): Tray {
  tray = new Tray(iconFor("plain"));
  tray.setToolTip("Deployer");

  tray.on("click", () => {
    if (!tray) return;
    hideMini();
    togglePopup(tray);
  });

  tray.on("right-click", () => {
    if (!tray) return;
    hidePopup();
    hideMini();
    tray.popUpContextMenu(buildRightClickMenu());
  });

  monitor.on("snapshot", (snap: MonitorSnapshot) => {
    currentSnapshot = snap;
    maybeStartTicker();
    render();
  });

  monitor.on("transitions", (events: TransitionEvent[]) => {
    const last = events[events.length - 1];
    if (!last) return;
    const d = last.deployment;
    const durationSeconds = buildDurationSeconds(d);
    highlight = {
      projectName: d.name,
      to: last.to,
      durationSeconds,
      at: Date.now(),
    };
    // New event: unsee the previous acknowledgement so the dot re-appears.
    acknowledged = false;
    maybeStartTicker();
    render();
    if (tray) {
      const autoHideMs = getPreferences().notificationDurationSeconds * 1000;
      showMini(
        tray,
        {
          deploymentId: d.id,
          projectName: d.name,
          outcome: last.to as "READY" | "ERROR" | "CANCELED",
          target: d.target === "production" ? "Production" : "Preview",
          durationSeconds,
          branch: d.meta.githubCommitRef ?? null,
        },
        autoHideMs, // 0 → persistent
      );
    }
  });

  // Popup signals the user saw the latest result → clear the dot.
  uiEvents.on("tray:ack", () => {
    if (acknowledged) return;
    acknowledged = true;
    render();
  });

  render();
  return tray;
}

export function refreshTray(): void {
  render();
}

function buildRightClickMenu(): Menu {
  const items: MenuItemConstructorOptions[] = [
    {
      label: "Show Deployments",
      click: () => {
        if (tray) showPopup(tray);
      },
    },
    { type: "separator" },
    { label: "Settings…", click: () => openSettingsWindow() },
    {
      label: "Quit Deployer",
      accelerator: "Cmd+Q",
      click: () => app.quit(),
    },
  ];
  return Menu.buildFromTemplate(items);
}

function maybeStartTicker(): void {
  const needsTicker =
    currentSnapshot.aggregateStatus === "building" ||
    (highlight !== null && Date.now() - highlight.at < HIGHLIGHT_MS);

  if (needsTicker && ticker === null) {
    ticker = setInterval(() => {
      if (highlight && Date.now() - highlight.at >= HIGHLIGHT_MS) {
        highlight = null;
      }
      if (
        currentSnapshot.aggregateStatus !== "building" &&
        highlight === null
      ) {
        if (ticker) {
          clearInterval(ticker);
          ticker = null;
        }
      }
      render();
    }, 1000);
  }
}

function render(): void {
  if (!tray) return;
  tray.setImage(iconFor(badgeFor(currentSnapshot, highlight)));
  tray.setTitle(computeTitle());
  tray.setToolTip(tooltipFor(currentSnapshot));
}

function computeTitle(): string {
  if (currentSnapshot.aggregateStatus === "unauth") return "";

  if (highlight) {
    if (highlight.to === "READY") {
      return ` ${formatDuration(highlight.durationSeconds)}`;
    }
    if (highlight.to === "ERROR") return " failed";
    if (highlight.to === "CANCELED") return " canceled";
  }

  if (currentSnapshot.aggregateStatus === "building") {
    const oldest = oldestBuilding(currentSnapshot);
    if (oldest) {
      // Show time since the BUILD phase started. If we're still QUEUED
      // (no buildingAt yet) the helper falls back to createdAt, so the
      // user sees the queue wait rather than a stuck 0:00.
      const elapsed = buildDurationSeconds(oldest);
      return ` ${formatDuration(elapsed)}`;
    }
  }

  return "";
}

function oldestBuilding(snap: MonitorSnapshot): Deployment | null {
  let oldest: Deployment | null = null;
  for (const d of Object.values(snap.latestByProject)) {
    if (!d) continue;
    if (
      d.state === "BUILDING" ||
      d.state === "QUEUED" ||
      d.state === "INITIALIZING"
    ) {
      if (!oldest || d.createdAt < oldest.createdAt) oldest = d;
    }
  }
  return oldest;
}

function tooltipFor(snap: MonitorSnapshot): string {
  if (snap.aggregateStatus === "unauth") {
    return "Deployer — token missing or invalid";
  }
  if (snap.lastCheckedAt === null) {
    return "Deployer — never checked";
  }
  return `Deployer — last checked ${formatClock(snap.lastCheckedAt)}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
