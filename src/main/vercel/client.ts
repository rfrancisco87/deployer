import type { Deployment, DeploymentState, Project } from "../../shared/types";
import type {
  VercelDeploymentDTO,
  VercelDeploymentsResponse,
  VercelProjectsResponse,
  VercelUserDTO,
} from "./types";

const BASE = "https://api.vercel.com";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Vercel token is missing or invalid");
    this.name = "UnauthenticatedError";
  }
}

export class RateLimitedError extends Error {
  constructor(public retryAfterSeconds: number) {
    super(`Vercel rate-limited; retry in ${retryAfterSeconds}s`);
    this.name = "RateLimitedError";
  }
}

export class TransportError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "TransportError";
  }
}

export class DecodeError extends Error {
  constructor() {
    super("Could not decode Vercel response");
    this.name = "DecodeError";
  }
}

interface RequestOptions {
  path: string;
  method?: string;
  query?: Record<string, string | number | undefined>;
}

const KNOWN_STATES: ReadonlySet<DeploymentState> = new Set([
  "QUEUED",
  "INITIALIZING",
  "BUILDING",
  "READY",
  "ERROR",
  "CANCELED",
]);

function normalizeState(raw: string | undefined): DeploymentState {
  if (raw && KNOWN_STATES.has(raw as DeploymentState)) {
    return raw as DeploymentState;
  }
  return "QUEUED";
}

function toDeployment(dto: VercelDeploymentDTO): Deployment {
  const id = dto.uid ?? dto.id ?? "";
  const state = normalizeState(
    (dto.state ?? dto.readyState) as string | undefined,
  );
  return {
    id,
    url: dto.url,
    name: dto.name,
    state,
    target: dto.target === "production" ? "production" : null,
    createdAt: dto.createdAt ?? dto.created ?? Date.now(),
    buildingAt: dto.buildingAt ?? null,
    readyAt: state === "READY" ? (dto.ready ?? dto.readyAt ?? null) : null,
    meta: {
      // Vercel exposes commit data under provider-specific keys. Fall
      // through GitHub → GitLab → Bitbucket so every connected repo
      // populates the same Deployment.meta shape downstream.
      githubCommitMessage:
        dto.meta?.githubCommitMessage ??
        dto.meta?.gitlabCommitMessage ??
        dto.meta?.bitbucketCommitMessage,
      githubCommitRef:
        dto.meta?.githubCommitRef ??
        dto.meta?.gitlabCommitRef ??
        dto.meta?.bitbucketCommitRef,
      githubCommitSha:
        dto.meta?.githubCommitSha ??
        dto.meta?.gitlabCommitSha ??
        dto.meta?.bitbucketCommitSha,
      githubRepo:
        dto.meta?.githubRepo ??
        dto.meta?.gitlabProjectName ??
        dto.meta?.bitbucketRepoSlug,
      githubRepoOwner:
        dto.meta?.githubRepoOwner ??
        dto.meta?.gitlabProjectNamespace ??
        dto.meta?.bitbucketRepoOwner,
    },
    inspectorUrl: dto.inspectorUrl ?? null,
    creator: dto.creator?.username ?? null,
    aliases: Array.isArray(dto.alias) ? dto.alias : [],
  };
}

export class VercelClient {
  constructor(private readonly getToken: () => Promise<string | null>) {}

  async getUser(): Promise<{ username: string }> {
    const data = await this.request<VercelUserDTO>({ path: "/v2/user" });
    const username =
      data.user.username ?? data.user.name ?? data.user.email ?? "unknown";
    return { username };
  }

  async listProjects(): Promise<Project[]> {
    const data = await this.request<VercelProjectsResponse>({
      path: "/v9/projects",
      query: { limit: 100 },
    });
    return data.projects.map((p) => ({
      id: p.id,
      name: p.name,
      framework: p.framework ?? null,
    }));
  }

  async listDeployments(projectId: string, limit = 20): Promise<Deployment[]> {
    const data = await this.request<VercelDeploymentsResponse>({
      path: "/v6/deployments",
      query: { projectId, limit },
    });
    return data.deployments.map(toDeployment);
  }

  private async request<T>(opts: RequestOptions): Promise<T> {
    const token = await this.getToken();
    if (!token) throw new UnauthenticatedError();

    const url = new URL(opts.path, BASE);
    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }

    let res: Response;
    try {
      res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      throw new TransportError((err as Error).message);
    }

    if (res.status === 401 || res.status === 403) {
      throw new UnauthenticatedError();
    }
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "60", 10);
      throw new RateLimitedError(Number.isFinite(retryAfter) ? retryAfter : 60);
    }
    if (!res.ok) {
      throw new TransportError(
        `HTTP ${res.status} ${res.statusText}`,
        res.status,
      );
    }

    try {
      return (await res.json()) as T;
    } catch {
      throw new DecodeError();
    }
  }
}
