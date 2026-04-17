import { contextBridge, ipcRenderer } from "electron";

type Unsubscribe = () => void;

const api = {
  // Settings window
  getConfig: () => ipcRenderer.invoke("deployer:getConfig"),
  setToken: (token: string) => ipcRenderer.invoke("deployer:setToken", token),
  clearToken: () => ipcRenderer.invoke("deployer:clearToken"),
  refreshProjects: () => ipcRenderer.invoke("deployer:refreshProjects"),
  setWatchedProjects: (ids: string[]) =>
    ipcRenderer.invoke("deployer:setWatchedProjects", ids),
  setPollInterval: (seconds: number) =>
    ipcRenderer.invoke("deployer:setPollInterval", seconds),
  setLaunchAtLogin: (enabled: boolean) =>
    ipcRenderer.invoke("deployer:setLaunchAtLogin", enabled),
  setNotificationDuration: (seconds: number) =>
    ipcRenderer.invoke("deployer:setNotificationDuration", seconds),
  openExternal: (url: string) =>
    ipcRenderer.invoke("deployer:openExternal", url),
  onConfigChanged: (cb: (config: unknown) => void): Unsubscribe => {
    const listener = (_: unknown, config: unknown) => cb(config);
    ipcRenderer.on("deployer:configChanged", listener);
    return () => {
      ipcRenderer.removeListener("deployer:configChanged", listener);
    };
  },

  // Popup window
  getSnapshot: () => ipcRenderer.invoke("deployer:getSnapshot"),
  refreshNow: () => ipcRenderer.invoke("deployer:refreshNow"),
  copyText: (text: string) => ipcRenderer.invoke("deployer:copyText", text),
  openSettings: () => ipcRenderer.invoke("deployer:openSettings"),
  quit: () => ipcRenderer.invoke("deployer:quit"),
  acknowledge: () => ipcRenderer.invoke("deployer:acknowledge"),
  getFocus: () => ipcRenderer.invoke("deployer:getFocus"),
  onSnapshotChanged: (cb: (snap: unknown) => void): Unsubscribe => {
    const listener = (_: unknown, snap: unknown) => cb(snap);
    ipcRenderer.on("deployer:snapshotChanged", listener);
    return () => {
      ipcRenderer.removeListener("deployer:snapshotChanged", listener);
    };
  },
  onFocusChanged: (cb: (id: string | null) => void): Unsubscribe => {
    const listener = (_: unknown, id: string | null) => cb(id);
    ipcRenderer.on("deployer:focusChanged", listener);
    return () => {
      ipcRenderer.removeListener("deployer:focusChanged", listener);
    };
  },
  onPopupReset: (cb: () => void): Unsubscribe => {
    const listener = () => cb();
    ipcRenderer.on("deployer:popupReset", listener);
    return () => {
      ipcRenderer.removeListener("deployer:popupReset", listener);
    };
  },

  // Mini notification window
  getMiniPayload: () => ipcRenderer.invoke("deployer:getMiniPayload"),
  openDeploymentDetail: (id: string) =>
    ipcRenderer.invoke("deployer:openDeploymentDetail", id),
  dismissMini: () => ipcRenderer.invoke("deployer:dismissMini"),
  onMiniPayload: (cb: (payload: unknown) => void): Unsubscribe => {
    const listener = (_: unknown, payload: unknown) => cb(payload);
    ipcRenderer.on("deployer:miniPayload", listener);
    return () => {
      ipcRenderer.removeListener("deployer:miniPayload", listener);
    };
  },
};

contextBridge.exposeInMainWorld("deployer", api);
