import type { Project } from "../shared/types";

export interface TokenStatus {
  username?: string;
  error?: string;
}

let cachedProjects: Project[] = [];
let tokenStatus: TokenStatus | null = null;
const listeners = new Set<() => void>();

export function getCachedProjects(): Project[] {
  return cachedProjects;
}

export function setCachedProjects(projects: Project[]): void {
  cachedProjects = projects;
  notify();
}

export function clearCachedProjects(): void {
  cachedProjects = [];
  notify();
}

export function getTokenStatus(): TokenStatus | null {
  return tokenStatus;
}

export function setTokenStatus(status: TokenStatus | null): void {
  tokenStatus = status;
  notify();
}

export function onAuthStateChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notify(): void {
  for (const cb of listeners) {
    try {
      cb();
    } catch (err) {
      console.error("auth-state listener error", err);
    }
  }
}
