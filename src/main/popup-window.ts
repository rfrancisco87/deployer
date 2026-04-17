import { BrowserWindow, screen, type Tray } from "electron";
import path from "path";

let focusedDeploymentId: string | null = null;
const focusListeners = new Set<(id: string | null) => void>();

export function getFocus(): string | null {
  return focusedDeploymentId;
}

export function setFocus(id: string | null): void {
  if (focusedDeploymentId === id) return;
  focusedDeploymentId = id;
  for (const cb of focusListeners) cb(id);
}

export function onFocusChanged(cb: (id: string | null) => void): () => void {
  focusListeners.add(cb);
  return () => focusListeners.delete(cb);
}

const POPUP_WIDTH = 440;
const POPUP_HEIGHT = 560;
const POPUP_MARGIN = 4;

let popupWindow: BrowserWindow | null = null;
let autoHideTimer: NodeJS.Timeout | null = null;

function cancelAutoHide(): void {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }
}

function create(): BrowserWindow {
  if (popupWindow && !popupWindow.isDestroyed()) return popupWindow;

  popupWindow = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
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
    vibrancy: undefined,
    webPreferences: {
      preload: path.join(__dirname, "..", "renderer", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  popupWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  void popupWindow.loadFile(
    path.join(__dirname, "..", "renderer", "popup.html"),
  );

  popupWindow.on("blur", () => {
    if (process.env.DEPLOYER_DEVTOOLS === "1") return;
    hidePopup();
  });

  popupWindow.on("hide", () => {
    // Clear focus so the next manual open shows the full list.
    setFocus(null);
  });

  popupWindow.on("closed", () => {
    popupWindow = null;
  });

  popupWindow.webContents.on(
    "console-message",
    (_e, level, message, line, sourceId) => {
      console.log(`[popup:${level}] ${sourceId}:${line} ${message}`);
    },
  );

  return popupWindow;
}

function positionUnderTray(tray: Tray): void {
  if (!popupWindow) return;
  const trayBounds = tray.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: trayBounds.x,
    y: trayBounds.y,
  });
  const workArea = display.workArea;

  const rawX = Math.round(
    trayBounds.x + trayBounds.width / 2 - POPUP_WIDTH / 2,
  );
  const y = Math.round(
    trayBounds.y + trayBounds.height + POPUP_MARGIN,
  );

  const minX = workArea.x + 8;
  const maxX = workArea.x + workArea.width - POPUP_WIDTH - 8;
  const x = Math.max(minX, Math.min(rawX, maxX));

  popupWindow.setPosition(x, y, false);
}

export function showPopup(tray: Tray, autoHideMs?: number): void {
  const w = create();
  positionUnderTray(tray);
  w.show();
  w.focus();
  cancelAutoHide();
  if (autoHideMs && autoHideMs > 0) {
    autoHideTimer = setTimeout(() => {
      hidePopup();
    }, autoHideMs);
  }
}

export function showPopupFocused(
  tray: Tray,
  deploymentId: string,
  autoHideMs?: number,
): void {
  setFocus(deploymentId);
  showPopup(tray, autoHideMs);
}

export function hidePopup(): void {
  cancelAutoHide();
  if (popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible()) {
    popupWindow.hide();
  }
}

export function togglePopup(tray: Tray): void {
  if (
    popupWindow &&
    !popupWindow.isDestroyed() &&
    popupWindow.isVisible()
  ) {
    hidePopup();
  } else {
    showPopup(tray);
  }
}

export function getPopupWindow(): BrowserWindow | null {
  return popupWindow;
}
