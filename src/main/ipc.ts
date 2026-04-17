import { app, BrowserWindow, clipboard, ipcMain } from "electron";
import { openUrl } from "./open-url";
import type { ConfigSnapshot } from "../shared/types";
import {
  clearCachedProjects,
  getCachedProjects,
  getTokenStatus,
  setCachedProjects,
  setTokenStatus,
} from "./auth-state";
import * as keychain from "./keychain";
import { getLaunchAtLogin, setLaunchAtLogin } from "./launch-at-login";
import type { Monitor } from "./monitor";
import { getPreferences, savePreferences } from "./preferences";
import { getCurrentMiniPayload, hideMini } from "./mini-window";
import {
  getFocus,
  onFocusChanged,
  showPopupFocused,
} from "./popup-window";
import { openSettingsWindow } from "./settings-window";
import { uiEvents } from "./ui-events";
import {
  checkForUpdate,
  getLastUpdateInfo,
} from "./update-checker";
import { UnauthenticatedError, VercelClient } from "./vercel/client";
import type { Tray } from "electron";

export function registerIpc(
  client: VercelClient,
  monitor: Monitor,
  getTray: () => Tray | null,
): void {
  const buildConfig = async (): Promise<ConfigSnapshot> => {
    const prefs = getPreferences();
    const token = await keychain.getToken();
    return {
      hasToken: !!token,
      tokenStatus: getTokenStatus(),
      projects: getCachedProjects(),
      watchedProjectIds: prefs.watchedProjectIds,
      pollIntervalSeconds: prefs.pollIntervalSeconds,
      launchAtLogin: getLaunchAtLogin(),
      notificationDurationSeconds: prefs.notificationDurationSeconds,
    };
  };

  const broadcast = async (): Promise<void> => {
    const cfg = await buildConfig();
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send("deployer:configChanged", cfg);
    }
  };

  const broadcastSnapshot = (): void => {
    const snap = monitor.getSnapshot();
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) {
        w.webContents.send("deployer:snapshotChanged", snap);
      }
    }
  };
  monitor.on("snapshot", broadcastSnapshot);

  const broadcastFocus = (id: string | null): void => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send("deployer:focusChanged", id);
    }
  };
  onFocusChanged(broadcastFocus);

  ipcMain.handle("deployer:getConfig", buildConfig);

  ipcMain.handle("deployer:setToken", async (_e, token: unknown) => {
    console.log("[deployer] setToken called, tokenLen:",
      typeof token === "string" ? token.length : typeof token);
    if (typeof token !== "string" || token.trim().length === 0) {
      return { ok: false, error: "Token is empty" };
    }
    try {
      await keychain.setToken(token.trim());
      console.log("[deployer] keychain.setToken OK");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Keychain write failed";
      console.error("[deployer] keychain.setToken failed:", err);
      setTokenStatus({ error: `Keychain error: ${msg}` });
      void broadcast();
      return { ok: false, error: `Keychain error: ${msg}` };
    }
    try {
      const user = await client.getUser();
      setTokenStatus({ username: user.username });
      try {
        setCachedProjects(await client.listProjects());
      } catch {
        // Swallow — user can hit Refresh manually.
      }
      monitor.refreshNow().catch(() => {
        // Monitor errors are reflected in its own snapshot.
      });
      void broadcast();
      return { ok: true, username: user.username };
    } catch (err) {
      const message =
        err instanceof UnauthenticatedError
          ? "Vercel rejected this token"
          : err instanceof Error
            ? err.message
            : "Unknown error";
      setTokenStatus({ error: message });
      void broadcast();
      return { ok: false, error: message };
    }
  });

  ipcMain.handle("deployer:clearToken", async () => {
    await keychain.clearToken();
    setTokenStatus(null);
    clearCachedProjects();
    void broadcast();
  });

  ipcMain.handle("deployer:refreshProjects", async () => {
    try {
      const user = await client.getUser();
      setTokenStatus({ username: user.username });
      const projects = await client.listProjects();
      setCachedProjects(projects);
      void broadcast();
      return projects;
    } catch (err) {
      const message =
        err instanceof UnauthenticatedError
          ? "Vercel rejected this token"
          : err instanceof Error
            ? err.message
            : "Unknown error";
      setTokenStatus({ error: message });
      void broadcast();
      return [];
    }
  });

  ipcMain.handle(
    "deployer:setWatchedProjects",
    async (_e, ids: unknown) => {
      if (!Array.isArray(ids)) return;
      const clean = ids.filter((x): x is string => typeof x === "string");
      savePreferences({ watchedProjectIds: clean });
      monitor.refreshNow().catch(() => {
        // ignore
      });
      void broadcast();
    },
  );

  ipcMain.handle(
    "deployer:setPollInterval",
    async (_e, seconds: unknown) => {
      const n = Number(seconds);
      if (!Number.isFinite(n)) return;
      const clamped = Math.max(20, Math.min(600, Math.round(n)));
      savePreferences({ pollIntervalSeconds: clamped });
      void broadcast();
    },
  );

  ipcMain.handle(
    "deployer:setLaunchAtLogin",
    async (_e, enabled: unknown) => {
      const on = !!enabled;
      setLaunchAtLogin(on);
      savePreferences({ launchAtLogin: on });
      void broadcast();
    },
  );

  ipcMain.handle(
    "deployer:setNotificationDuration",
    async (_e, seconds: unknown) => {
      const n = Number(seconds);
      if (!Number.isFinite(n) || n < 0) return;
      savePreferences({ notificationDurationSeconds: Math.round(n) });
      void broadcast();
    },
  );

  ipcMain.handle("deployer:openExternal", async (_e, url: unknown) => {
    if (typeof url === "string") await openUrl(url);
  });

  // Popup window channels
  ipcMain.handle("deployer:getSnapshot", () => monitor.getSnapshot());

  ipcMain.handle("deployer:refreshNow", async () => {
    await monitor.refreshNow();
  });

  ipcMain.handle("deployer:copyText", async (_e, text: unknown) => {
    if (typeof text === "string") clipboard.writeText(text);
  });

  ipcMain.handle("deployer:openSettings", async () => {
    openSettingsWindow();
  });

  ipcMain.handle("deployer:quit", async () => {
    app.quit();
  });

  ipcMain.handle("deployer:acknowledge", () => {
    uiEvents.emit("tray:ack");
  });

  ipcMain.handle("deployer:getFocus", () => getFocus());

  // Mini notification → open full popup focused on this deployment
  ipcMain.handle("deployer:getMiniPayload", () => getCurrentMiniPayload());

  ipcMain.handle(
    "deployer:openDeploymentDetail",
    (_e, id: unknown) => {
      if (typeof id !== "string") return;
      const tray = getTray();
      if (!tray) return;
      hideMini();
      showPopupFocused(tray, id);
    },
  );

  ipcMain.handle("deployer:dismissMini", () => {
    hideMini();
  });

  // Update checker
  ipcMain.handle("deployer:getUpdateInfo", () => getLastUpdateInfo());
  ipcMain.handle("deployer:checkForUpdate", () => checkForUpdate());
}
