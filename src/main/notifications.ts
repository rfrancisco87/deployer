import { Notification, shell } from "electron";
import type { TransitionEvent } from "../shared/types";
import type { Monitor } from "./monitor";

export function connectNotifications(monitor: Monitor): void {
  monitor.on("transitions", (events: TransitionEvent[]) => {
    // If a single deployment appears multiple times (shouldn't normally, but
    // possible if the diff logic ever widens), only post the latest state.
    const latest = new Map<string, TransitionEvent>();
    for (const e of events) latest.set(e.deployment.id, e);
    for (const e of latest.values()) postNotification(e);
  });
}

function postNotification(event: TransitionEvent): void {
  if (!Notification.isSupported()) return;

  const d = event.deployment;
  const commit =
    d.meta.githubCommitMessage?.split("\n")[0] ?? "(no commit message)";
  const branch = d.meta.githubCommitRef;
  const body = branch ? `${branch} · ${commit}` : commit;

  const verb =
    event.to === "READY"
      ? "succeeded"
      : event.to === "ERROR"
        ? "failed"
        : "was canceled";

  const n = new Notification({
    title: `Vercel · ${d.name} ${verb}`,
    body,
    silent: event.to === "READY",
  });

  n.on("click", () => {
    const url = deepLink(event);
    void shell.openExternal(url);
  });

  n.show();
}

function deepLink(event: TransitionEvent): string {
  const d = event.deployment;
  if (d.inspectorUrl) return d.inspectorUrl;
  // Fall back to the deployment URL; still useful even without dashboard link.
  return `https://${d.url}`;
}
