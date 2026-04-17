import { powerMonitor } from "electron";
import type { Monitor } from "./monitor";

export function wirePowerMonitor(monitor: Monitor): void {
  powerMonitor.on("suspend", () => monitor.pause());
  powerMonitor.on("resume", () => monitor.resume());
}
