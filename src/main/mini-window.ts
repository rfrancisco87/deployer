import { BrowserWindow, screen, type Tray } from "electron";
import path from "path";

const MINI_W = 360;
const MINI_H = 70;
const MINI_MARGIN = 4;

export interface MiniPayload {
  deploymentId: string;
  projectName: string;
  outcome: "READY" | "ERROR" | "CANCELED";
  target: "Production" | "Preview";
  durationSeconds: number;
  branch: string | null;
}

let miniWindow: BrowserWindow | null = null;
let currentPayload: MiniPayload | null = null;
let autoHideTimer: NodeJS.Timeout | null = null;

function cancelAutoHide(): void {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }
}

function create(): BrowserWindow {
  if (miniWindow && !miniWindow.isDestroyed()) return miniWindow;

  miniWindow = new BrowserWindow({
    width: MINI_W,
    height: MINI_H,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    hasShadow: true,
    backgroundColor: "#00000000",
    roundedCorners: true,
    focusable: false, // don't steal focus when it appears
    webPreferences: {
      preload: path.join(__dirname, "..", "renderer", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  miniWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  miniWindow.setAlwaysOnTop(true, "floating");

  void miniWindow.loadFile(
    path.join(__dirname, "..", "renderer", "mini.html"),
  );

  miniWindow.webContents.on(
    "console-message",
    (_e, level, message, line, sourceId) => {
      console.log(`[mini:${level}] ${sourceId}:${line} ${message}`);
    },
  );

  miniWindow.on("closed", () => {
    miniWindow = null;
  });

  return miniWindow;
}

function positionUnderTray(tray: Tray): void {
  if (!miniWindow) return;
  const b = tray.getBounds();
  const display = screen.getDisplayNearestPoint({ x: b.x, y: b.y });
  const wa = display.workArea;
  const rawX = Math.round(b.x + b.width / 2 - MINI_W / 2);
  const x = Math.max(wa.x + 8, Math.min(rawX, wa.x + wa.width - MINI_W - 8));
  const y = Math.round(b.y + b.height + MINI_MARGIN);
  miniWindow.setPosition(x, y, false);
}

function deliverPayload(w: BrowserWindow): void {
  if (!currentPayload) return;
  const send = () => w.webContents.send("deployer:miniPayload", currentPayload);
  if (w.webContents.isLoading()) {
    w.webContents.once("did-finish-load", send);
  } else {
    send();
  }
}

export function showMini(
  tray: Tray,
  payload: MiniPayload,
  autoHideMs = 35_000,
): void {
  currentPayload = payload;
  const w = create();
  deliverPayload(w);
  positionUnderTray(tray);
  w.showInactive(); // show without stealing focus from the user's current app
  cancelAutoHide();
  if (autoHideMs > 0) {
    autoHideTimer = setTimeout(() => hideMini(), autoHideMs);
  }
}

export function hideMini(): void {
  cancelAutoHide();
  if (miniWindow && !miniWindow.isDestroyed() && miniWindow.isVisible()) {
    miniWindow.hide();
  }
}

export function getCurrentMiniPayload(): MiniPayload | null {
  return currentPayload;
}
