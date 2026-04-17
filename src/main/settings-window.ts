import { BrowserWindow } from "electron";
import path from "path";

let settingsWindow: BrowserWindow | null = null;

export function openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 560,
    height: 720,
    title: "Deployer — Settings",
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#0a0a0a",
    titleBarStyle: "hiddenInset",
    vibrancy: undefined,
    webPreferences: {
      preload: path.join(__dirname, "..", "renderer", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  settingsWindow.webContents.on(
    "console-message",
    (_e, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${sourceId}:${line} ${message}`);
    },
  );
  settingsWindow.webContents.on("preload-error", (_e, preloadPath, error) => {
    console.error(`[preload-error] ${preloadPath}:`, error);
  });
  settingsWindow.webContents.on(
    "did-fail-load",
    (_e, code, description, url) => {
      console.error(`[did-fail-load] ${url} (${code}): ${description}`);
    },
  );

  void settingsWindow.loadFile(
    path.join(__dirname, "..", "renderer", "settings.html"),
  );

  settingsWindow.once("ready-to-show", () => {
    settingsWindow?.show();
    if (process.env.DEPLOYER_DEVTOOLS === "1") {
      settingsWindow?.webContents.openDevTools({ mode: "detach" });
    }
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

export function getSettingsWindow(): BrowserWindow | null {
  return settingsWindow;
}
