// Popup window script. Loaded via <script src="./popup.js">.
// window.deployer is exposed by preload.ts via contextBridge.
// Wrapped in an IIFE so top-level bindings don't leak to the global scope
// (they would otherwise collide with settings.ts's identical identifiers).
(function popupMain(): void {

type DeploymentState =
  | "QUEUED"
  | "INITIALIZING"
  | "BUILDING"
  | "READY"
  | "ERROR"
  | "CANCELED";

interface DeploymentMeta {
  githubCommitMessage?: string;
  githubCommitRef?: string;
  githubCommitSha?: string;
  githubRepo?: string;
  githubRepoOwner?: string;
}

interface Deployment {
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

interface MonitorSnapshot {
  lastCheckedAt: number | null;
  lastError: string | null;
  latestByProject: Record<string, Deployment | null>;
  recentDeployments: Deployment[];
  aggregateStatus: "idle" | "building" | "ready" | "error" | "unauth";
}

interface DeployerBridge {
  getSnapshot(): Promise<MonitorSnapshot>;
  refreshNow(): Promise<void>;
  openExternal(url: string): Promise<void>;
  copyText(text: string): Promise<void>;
  openSettings(): Promise<void>;
  quit(): Promise<void>;
  acknowledge(): Promise<void>;
  getFocus(): Promise<string | null>;
  onSnapshotChanged(cb: (snap: MonitorSnapshot) => void): () => void;
  onFocusChanged(cb: (id: string | null) => void): () => void;
  onPopupReset(cb: () => void): () => void;
}

const bridge = (window as unknown as { deployer: DeployerBridge }).deployer;

console.log("[popup.ts] loaded, bridge:", typeof bridge);

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
};

let expandedId: string | null = null; // only one row expanded at a time
let ticker: ReturnType<typeof setInterval> | null = null;
let lastSnapshot: MonitorSnapshot | null = null;
let focusedId: string | null = null; // when set, list is filtered to just this one
let ackedForFocus: string | null = null; // tracks which focused id we've ACKed

function stateClass(state: DeploymentState): string {
  switch (state) {
    case "READY":
      return "ready";
    case "ERROR":
      return "error";
    case "CANCELED":
      return "canceled";
    case "BUILDING":
    case "QUEUED":
    case "INITIALIZING":
      return "building";
    default:
      return "";
  }
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function commitUrl(d: Deployment): string | null {
  const { githubRepo, githubRepoOwner, githubCommitSha } = d.meta;
  if (!githubRepo || !githubRepoOwner || !githubCommitSha) return null;
  return `https://github.com/${githubRepoOwner}/${githubRepo}/commit/${githubCommitSha}`;
}

function liveUrl(d: Deployment): string {
  const prod = d.aliases.find((a) => !a.includes(".vercel.app"));
  if (prod) return `https://${prod}`;
  const alias = d.aliases[0];
  if (alias) return `https://${alias}`;
  return `https://${d.url}`;
}

function buildRow(d: Deployment, isExpanded: boolean): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "row" + (isExpanded ? " expanded" : "");
  row.dataset.id = d.id;

  const head = document.createElement("div");
  head.className = "row-head";
  head.innerHTML = `
    <span class="dot ${stateClass(d.state)}"></span>
    <div class="row-main">
      <div class="row-project">${escapeHtml(d.name)}</div>
      <div class="row-sub">${escapeHtml(d.creator ? "@" + d.creator : d.meta.githubCommitRef ?? "")}</div>
    </div>
    <div class="row-side">
      <div class="target">${d.target === "production" ? "Production" : "Preview"}</div>
      <div class="date">${formatDate(d.createdAt)}</div>
    </div>
    <span class="row-chevron">▾</span>
  `;
  head.addEventListener("click", () => {
    const wasExpanded = expandedId === d.id;
    expandedId = wasExpanded ? null : d.id;
    // Any deliberate expand counts as "I've seen this" — drops the tray dot.
    if (!wasExpanded) void bridge.acknowledge();
    render(lastSnapshot);
  });
  row.appendChild(head);

  if (isExpanded) {
    row.appendChild(buildDetail(d));
  }
  return row;
}

function buildDetail(d: Deployment): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.className = "detail";

  const duration = document.createElement("div");
  duration.className = "duration";
  duration.innerHTML = `
    <span>◴</span>
    <span>Duration: <span class="duration-value" data-duration="${d.id}">${computeDurationLabel(d)}</span></span>
  `;
  wrap.appendChild(duration);

  const actions = document.createElement("div");
  actions.className = "actions";

  const deploymentUrl = d.inspectorUrl ?? (d.url ? `https://${d.url}` : null);
  actions.appendChild(
    makeActionButton("↗", "Deployment", !!deploymentUrl, () => {
      console.log("[popup.ts] Deployment click ->", deploymentUrl);
      if (deploymentUrl) {
        flashStatus(`Opening deployment…`);
        void bridge.openExternal(deploymentUrl);
      }
    }),
  );
  actions.appendChild(
    makeActionButton("≡", "Logs", !!d.inspectorUrl, () => {
      console.log("[popup.ts] Logs click ->", d.inspectorUrl);
      if (d.inspectorUrl) {
        flashStatus(`Opening logs…`);
        void bridge.openExternal(d.inspectorUrl);
      }
    }),
  );
  const cUrl = commitUrl(d);
  actions.appendChild(
    makeActionButton("⑂", "Commit", !!cUrl, () => {
      console.log("[popup.ts] Commit click ->", cUrl);
      if (cUrl) {
        flashStatus(`Opening commit…`);
        void bridge.openExternal(cUrl);
      }
    }),
  );
  const live = liveUrl(d);
  actions.appendChild(
    makeActionButton("◉", "View live", !!live, () => {
      console.log("[popup.ts] View live click ->", live);
      flashStatus(`Opening live URL…`);
      void bridge.openExternal(live);
    }),
  );

  wrap.appendChild(actions);

  const msg = d.meta.githubCommitMessage?.split("\n")[0]?.trim();
  if (msg) {
    const commit = document.createElement("div");
    commit.className = "commit";
    commit.innerHTML = `<div class="hash-line"># commit message</div><div class="msg-line">${escapeHtml(msg)}</div>`;
    wrap.appendChild(commit);
  }

  return wrap;
}

function makeActionButton(
  icon: string,
  label: string,
  enabled: boolean,
  onClick: () => void,
  codeSuffix?: string,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "action-btn";
  b.disabled = !enabled;
  b.innerHTML = `<span class="action-icon">${icon}</span><span>${escapeHtml(label)}${codeSuffix ? ` <code>\`${escapeHtml(codeSuffix)}\`</code>` : ""}</span>`;
  b.addEventListener("click", () => {
    if (!enabled) return;
    onClick();
  });
  return b;
}

function flashStatus(msg: string): void {
  const el = document.getElementById("footer-status");
  if (!el) return;
  el.textContent = msg;
  // Reset after 2s so the lastChecked time reappears.
  setTimeout(() => {
    if (el.textContent === msg && lastSnapshot?.lastCheckedAt) {
      el.textContent = `Checked ${formatClock(lastSnapshot.lastCheckedAt)}`;
    }
  }, 2000);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isTerminal(s: DeploymentState): boolean {
  return s === "READY" || s === "ERROR" || s === "CANCELED";
}

function computeDurationLabel(d: Deployment): string {
  const seconds = Math.floor((Date.now() - d.createdAt) / 1000);
  return formatDuration(seconds);
}

function render(snap: MonitorSnapshot | null): void {
  lastSnapshot = snap;
  const list = $("list");
  const footer = $("footer-status");

  if (!snap) {
    list.innerHTML =
      '<div class="empty-state"><h3>Loading…</h3><p>Fetching your deployments.</p></div>';
    footer.textContent = "—";
    return;
  }

  footer.textContent =
    snap.lastCheckedAt !== null
      ? `Checked ${formatClock(snap.lastCheckedAt)}`
      : "Never checked";

  if (snap.aggregateStatus === "unauth") {
    list.innerHTML =
      '<div class="empty-state"><h3>Sign in to Vercel</h3><p>Paste a token in Settings to get started.</p><button id="empty-settings">Open Settings</button></div>';
    const b = document.getElementById("empty-settings");
    b?.addEventListener("click", () => void bridge.openSettings());
    return;
  }

  if (snap.recentDeployments.length === 0) {
    list.innerHTML =
      '<div class="empty-state"><h3>No deployments yet</h3><p>Pick which projects to watch in Settings.</p><button id="empty-settings">Open Settings</button></div>';
    const b = document.getElementById("empty-settings");
    b?.addEventListener("click", () => void bridge.openSettings());
    return;
  }

  // In focus mode, show only the focused deployment (expanded + an escape hatch).
  let toRender = snap.recentDeployments;
  if (focusedId) {
    const focused = snap.recentDeployments.find((d) => d.id === focusedId);
    if (focused) {
      toRender = [focused];
      expandedId = focused.id;
      // The user is seeing the detail card for this deployment → ack once.
      if (ackedForFocus !== focused.id) {
        ackedForFocus = focused.id;
        void bridge.acknowledge();
      }
    } else {
      focusedId = null; // the deployment fell off the list; drop focus
    }
  } else if (expandedId === null) {
    // Normal mode: auto-expand the most recent if nothing is expanded
    expandedId = snap.recentDeployments[0]?.id ?? null;
    if (expandedId) void bridge.acknowledge();
  }

  list.innerHTML = "";
  for (const d of toRender) {
    list.appendChild(buildRow(d, d.id === expandedId));
  }

  if (focusedId) {
    const showAll = document.createElement("button");
    showAll.type = "button";
    showAll.className = "show-all-btn";
    showAll.textContent = "Show all deployments";
    showAll.addEventListener("click", () => {
      focusedId = null;
      ackedForFocus = null;
      render(lastSnapshot);
    });
    list.appendChild(showAll);
  }

  maybeStartTicker();
}

function maybeStartTicker(): void {
  const hasActive = !!lastSnapshot?.recentDeployments.some(
    (d) => !isTerminal(d.state),
  );
  if (hasActive && ticker === null) {
    ticker = setInterval(() => {
      if (!lastSnapshot) return;
      for (const d of lastSnapshot.recentDeployments) {
        if (isTerminal(d.state)) continue;
        const el = document.querySelector<HTMLElement>(
          `[data-duration="${d.id}"]`,
        );
        if (el) el.textContent = computeDurationLabel(d);
      }
    }, 1000);
  } else if (!hasActive && ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
}

async function init(): Promise<void> {
  $("refresh").addEventListener("click", async () => {
    await bridge.refreshNow();
  });
  $("settings").addEventListener("click", async () => {
    await bridge.openSettings();
  });
  $("quit").addEventListener("click", async () => {
    await bridge.quit();
  });

  bridge.onSnapshotChanged((snap) => render(snap));
  bridge.onFocusChanged((id) => {
    focusedId = id;
    if (id === null) ackedForFocus = null;
    if (lastSnapshot) render(lastSnapshot);
  });
  bridge.onPopupReset(() => {
    expandedId = null;
  });

  focusedId = await bridge.getFocus();
  const snap = await bridge.getSnapshot();
  render(snap);
}

void init();
})();
