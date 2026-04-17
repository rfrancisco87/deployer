import { app } from "electron";

export function setLaunchAtLogin(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled });
}

export function getLaunchAtLogin(): boolean {
  return app.getLoginItemSettings().openAtLogin;
}
