import type { DeploymentState } from "../../shared/types";

export interface VercelUserDTO {
  user: {
    uid?: string;
    username?: string;
    email?: string;
    name?: string;
  };
}

export interface VercelProjectDTO {
  id: string;
  name: string;
  framework?: string | null;
}

export interface VercelProjectsResponse {
  projects: VercelProjectDTO[];
  pagination?: unknown;
}

export interface VercelDeploymentMetaDTO {
  githubCommitMessage?: string;
  githubCommitRef?: string;
  githubCommitSha?: string;
  githubRepo?: string;
  githubRepoOwner?: string;

  // GitLab-connected projects expose the same data under different keys.
  gitlabCommitMessage?: string;
  gitlabCommitRef?: string;
  gitlabCommitSha?: string;
  gitlabProjectNamespace?: string;
  gitlabProjectName?: string;

  // Bitbucket-connected projects.
  bitbucketCommitMessage?: string;
  bitbucketCommitRef?: string;
  bitbucketCommitSha?: string;
  bitbucketRepoOwner?: string;
  bitbucketRepoSlug?: string;
}

export interface VercelDeploymentDTO {
  uid?: string;
  id?: string;
  name: string;
  url: string;
  state?: DeploymentState | string;
  readyState?: DeploymentState | string;
  target?: string | null;
  created?: number;
  createdAt?: number;
  /** When the build phase started (ms epoch). Null/absent while queued. */
  buildingAt?: number | null;
  /** When the deployment reached READY (ms epoch). */
  ready?: number | null;
  readyAt?: number | null;
  meta?: VercelDeploymentMetaDTO;
  inspectorUrl?: string;
  creator?: { username?: string; uid?: string } | null;
  alias?: string[];
  aliasAssigned?: number | null;
}

export interface VercelDeploymentsResponse {
  deployments: VercelDeploymentDTO[];
  pagination?: unknown;
}
