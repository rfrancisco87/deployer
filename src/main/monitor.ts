import { EventEmitter } from "events";
import {
  isTerminal,
  type AggregateStatus,
  type Deployment,
  type MonitorSnapshot,
  type TransitionEvent,
} from "../shared/types";
import { getPreferences } from "./preferences";
import type { StateStore } from "./state-store";
import { UnauthenticatedError, VercelClient } from "./vercel/client";

const DEFAULT_INTERVAL_MS = 45_000;
const BACKOFF_INITIAL_MS = 30_000;
const BACKOFF_MAX_MS = 5 * 60_000;

export class Monitor extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private paused = false;
  private firstTick = true;
  private backoffMs = 0;
  private inflight = false;
  private snapshot: MonitorSnapshot = {
    lastCheckedAt: null,
    lastError: null,
    latestByProject: {},
    recentDeployments: [],
    aggregateStatus: "idle",
  };

  constructor(
    private readonly client: VercelClient,
    private readonly stateStore: StateStore,
  ) {
    super();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.firstTick = true;
    this.scheduleTick(0);
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.clearTimer();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    // First tick after resume is silent to avoid storms after long sleeps.
    this.firstTick = true;
    this.scheduleTick(0);
  }

  async refreshNow(): Promise<void> {
    this.clearTimer();
    await this.tick();
  }

  getSnapshot(): MonitorSnapshot {
    return this.snapshot;
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleTick(delayMs: number): void {
    if (!this.running || this.paused) return;
    this.clearTimer();
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (!this.running || this.paused) return;
    if (this.inflight) return;
    this.inflight = true;

    const prefs = getPreferences();
    const intervalMs = Math.max(20_000, prefs.pollIntervalSeconds * 1000);

    try {
      await this.doTick(prefs.watchedProjectIds);
      this.backoffMs = 0;
      this.snapshot = { ...this.snapshot, lastError: null };
      this.emit("snapshot", this.snapshot);
      this.scheduleTick(intervalMs);
    } catch (err) {
      const isAuth = err instanceof UnauthenticatedError;
      this.snapshot = {
        ...this.snapshot,
        lastError: (err as Error).message,
        aggregateStatus: isAuth ? "unauth" : this.snapshot.aggregateStatus,
      };
      this.emit("snapshot", this.snapshot);
      if (isAuth) {
        this.scheduleTick(intervalMs);
      } else {
        this.backoffMs =
          this.backoffMs === 0
            ? BACKOFF_INITIAL_MS
            : Math.min(this.backoffMs * 2, BACKOFF_MAX_MS);
        this.scheduleTick(this.backoffMs);
      }
    } finally {
      this.inflight = false;
    }
  }

  private async doTick(watchedProjectIds: string[]): Promise<void> {
    if (watchedProjectIds.length === 0) {
      this.snapshot = {
        lastCheckedAt: Date.now(),
        lastError: null,
        latestByProject: {},
        recentDeployments: [],
        aggregateStatus: "idle",
      };
      this.firstTick = false;
      return;
    }

    const transitions: TransitionEvent[] = [];
    const latestByProject: Record<string, Deployment | null> = {};
    const allDeployments: Deployment[] = [];

    for (const pid of watchedProjectIds) {
      const deployments = await this.client.listDeployments(pid, 10);
      latestByProject[pid] = deployments[0] ?? null;
      allDeployments.push(...deployments);

      for (const d of deployments) {
        if (!d.id) continue;
        const prev = this.stateStore.get(d.id);
        if (prev === undefined) {
          this.stateStore.set(d.id, d.state);
        } else if (prev !== d.state) {
          this.stateStore.set(d.id, d.state);
          if (!this.firstTick && isTerminal(d.state) && !isTerminal(prev)) {
            transitions.push({ deployment: d, from: prev, to: d.state });
          }
        }
      }
    }

    this.stateStore.flush();
    this.firstTick = false;

    // Sort newest first, cap for the popup view.
    const recentDeployments = allDeployments
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 25);

    this.snapshot = {
      lastCheckedAt: Date.now(),
      lastError: null,
      latestByProject,
      recentDeployments,
      aggregateStatus: computeAggregate(latestByProject),
    };

    if (transitions.length > 0) {
      this.emit("transitions", transitions);
    }
  }
}

function computeAggregate(
  by: Record<string, Deployment | null>,
): AggregateStatus {
  const states = Object.values(by)
    .filter((d): d is Deployment => d !== null)
    .map((d) => d.state);
  if (states.length === 0) return "idle";
  if (states.some((s) => s === "ERROR")) return "error";
  if (states.some((s) => s === "BUILDING" || s === "QUEUED" || s === "INITIALIZING")) {
    return "building";
  }
  return "ready";
}

export function _defaultIntervalMs(): number {
  return DEFAULT_INTERVAL_MS;
}
