import { app, type Tray } from "electron";
import {
  onAuthStateChange,
  setCachedProjects,
  setTokenStatus,
} from "./auth-state";
import { registerIpc } from "./ipc";
import * as keychain from "./keychain";
import { Monitor } from "./monitor";
import { connectNotifications } from "./notifications";
import { wirePowerMonitor } from "./power";
import { loadPreferences } from "./preferences";
import { openSettingsWindow } from "./settings-window";
import { StateStore } from "./state-store";
import { initTray, refreshTray } from "./tray";
import { startUpdateChecker } from "./update-checker";
import { UnauthenticatedError, VercelClient } from "./vercel/client";

async function main(): Promise<void> {
  await app.whenReady();

  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.dock?.hide();

  loadPreferences();

  const client = new VercelClient(() => keychain.getToken());
  const stateStore = new StateStore();
  await stateStore.load();
  const monitor = new Monitor(client, stateStore);

  let tray: Tray | null = null;
  registerIpc(client, monitor, () => tray);
  connectNotifications(monitor);
  wirePowerMonitor(monitor);
  tray = initTray(monitor);

  // Re-render tray when projects/token status change (not just monitor ticks).
  onAuthStateChange(() => refreshTray());

  monitor.start();
  startUpdateChecker();

  const token = await keychain.getToken();
  if (!token) {
    // First run: nothing to do without a token.
    openSettingsWindow();
  } else {
    // Validate token + populate projects in background.
    void validateAndLoadProjects(client);
  }
}

async function validateAndLoadProjects(client: VercelClient): Promise<void> {
  try {
    const user = await client.getUser();
    setTokenStatus({ username: user.username });
  } catch (err) {
    setTokenStatus({
      error:
        err instanceof UnauthenticatedError
          ? "Vercel rejected this token"
          : err instanceof Error
            ? err.message
            : "Could not reach Vercel",
    });
    return;
  }
  try {
    const projects = await client.listProjects();
    setCachedProjects(projects);
  } catch {
    // Non-fatal — user can hit Refresh in Settings.
  }
}

app.on("second-instance", () => {
  openSettingsWindow();
});

// Electron's default behaviour is to quit when all windows close, even on
// macOS. Register an empty listener so the tray keeps the app alive after
// the Settings window is closed.
app.on("window-all-closed", () => {
  // no-op
});

void main();
