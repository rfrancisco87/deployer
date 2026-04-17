export type DeploymentState =
  | "QUEUED"
  | "INITIALIZING"
  | "BUILDING"
  | "READY"
  | "ERROR"
  | "CANCELED";

export const TERMINAL_STATES: ReadonlySet<DeploymentState> = new Set([
  "READY",
  "ERROR",
  "CANCELED",
]);

export const isTerminal = (s: DeploymentState): boolean =>
  TERMINAL_STATES.has(s);

export interface Project {
  id: string;
  name: string;
  framework: string | null;
}

export interface DeploymentMeta {
  githubCommitMessage?: string;
  githubCommitRef?: string;
  githubCommitSha?: string;
  githubRepo?: string;
  githubRepoOwner?: string;
}

export interface Deployment {
  id: string;
  url: string;
  name: string;
  state: DeploymentState;
  target: "production" | null;
  createdAt: number;
  meta: DeploymentMeta;
  inspectorUrl: string | null;
  creator: string | null;
  aliases: string[];
}

export type AggregateStatus =
  | "idle"
  | "building"
  | "ready"
  | "error"
  | "unauth";

export interface MonitorSnapshot {
  lastCheckedAt: number | null;
  lastError: string | null;
  latestByProject: Record<string, Deployment | null>;
  recentDeployments: Deployment[];
  aggregateStatus: AggregateStatus;
}

export interface TransitionEvent {
  deployment: Deployment;
  from: DeploymentState;
  to: DeploymentState;
}

export interface ConfigSnapshot {
  hasToken: boolean;
  tokenStatus: { username?: string; error?: string } | null;
  projects: Project[];
  watchedProjectIds: string[];
  pollIntervalSeconds: number;
  launchAtLogin: boolean;
  notificationDurationSeconds: number;
}
