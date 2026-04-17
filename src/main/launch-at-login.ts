import { app } from "electron";
import { getPreferences } from "./preferences";

export function setLaunchAtLogin(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled });
}

export function getLaunchAtLogin(): boolean {
  // Read from our own preference file rather than macOS's
  // getLoginItemSettings — the macOS API can silently fail to persist
  // for unsigned apps, which left the checkbox visibly out-of-sync
  // with what the user just toggled.
  return getPreferences().launchAtLogin;
}
