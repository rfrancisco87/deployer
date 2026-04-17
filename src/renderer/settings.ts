// Renderer script. Loaded via <script src="./settings.js"> — not a module.
// window.deployer is exposed by preload.ts via contextBridge.
// Everything lives inside an IIFE so top-level bindings stay local (otherwise
// they'd collide with popup.ts's identical bindings at global scope).
(function settingsMain(): void {

interface Project {
  id: string;
  name: string;
  framework: string | null;
}

interface ConfigSnapshot {
  hasToken: boolean;
  tokenStatus: { username?: string; error?: string } | null;
  projects: Project[];
  watchedProjectIds: string[];
  pollIntervalSeconds: number;
  launchAtLogin: boolean;
  notificationDurationSeconds: number;
}

interface DeployerApi {
  getConfig(): Promise<ConfigSnapshot>;
  setToken(t: string): Promise<{ ok: boolean; username?: string; error?: string }>;
  clearToken(): Promise<void>;
  refreshProjects(): Promise<Project[]>;
  setWatchedProjects(ids: string[]): Promise<void>;
  setPollInterval(seconds: number): Promise<void>;
  setLaunchAtLogin(enabled: boolean): Promise<void>;
  setNotificationDuration(seconds: number): Promise<void>;
  openExternal(url: string): Promise<void>;
  onConfigChanged(cb: (config: ConfigSnapshot) => void): () => void;
}

const bridge = (window as unknown as { deployer: DeployerApi }).deployer;

console.log("[settings.ts] loaded, bridge:", typeof bridge);
if (!bridge) {
  console.error("[settings.ts] window.deployer is undefined — preload failed");
}

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
};

function setStatus(message: string, kind: "ok" | "error" | "" = ""): void {
  const el = $("token-status");
  el.textContent = message;
  el.className = "status" + (kind ? " " + kind : "");
}

let currentProjects: Project[] = [];

function render(config: ConfigSnapshot): void {
  currentProjects = config.projects ?? [];
  // Token status line
  if (!config.hasToken) {
    setStatus("No token set");
  } else if (config.tokenStatus?.username) {
    setStatus(`Signed in as @${config.tokenStatus.username}`, "ok");
  } else if (config.tokenStatus?.error) {
    setStatus(config.tokenStatus.error, "error");
  } else {
    setStatus("Token saved — validating…");
  }

  // Projects list
  const list = $("project-list");
  if (!config.projects || config.projects.length === 0) {
    list.innerHTML =
      '<div class="empty">' +
      (config.hasToken
        ? "No projects yet — click Refresh."
        : "Save a valid token to load projects.") +
      "</div>";
  } else {
    const watched = new Set(config.watchedProjectIds);
    list.innerHTML = "";
    for (const p of config.projects) {
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = watched.has(p.id);
      cb.className = "project-cb";
      cb.dataset.id = p.id;
      cb.addEventListener("change", onProjectToggle);
      label.appendChild(cb);
      const name = document.createElement("span");
      name.textContent = p.name;
      label.appendChild(name);
      if (p.framework) {
        const meta = document.createElement("span");
        meta.className = "project-meta";
        meta.textContent = `· ${p.framework}`;
        label.appendChild(meta);
      }
      list.appendChild(label);
    }
  }

  // Select-all toggle label + disabled state
  const toggleBtn = $("toggle-all-projects") as HTMLButtonElement;
  const hasProjects = (config.projects?.length ?? 0) > 0;
  toggleBtn.disabled = !hasProjects;
  const allWatched =
    hasProjects &&
    config.projects.every((p) => config.watchedProjectIds.includes(p.id));
  toggleBtn.textContent = allWatched ? "Deselect all" : "Select all";
  toggleBtn.dataset.mode = allWatched ? "deselect" : "select";

  // Interval
  ($("interval") as HTMLInputElement).value = String(config.pollIntervalSeconds);

  // Launch at login
  ($("launch-at-login") as HTMLInputElement).checked = config.launchAtLogin;

  // Notification duration — coerce to one of the select's known values
  const durSelect = $("notification-duration") as HTMLSelectElement;
  const validDurations = new Set(["10", "30", "60", "0"]);
  const currentDur = String(config.notificationDurationSeconds);
  durSelect.value = validDurations.has(currentDur) ? currentDur : "30";
}


async function onProjectToggle(): Promise<void> {
  const checkboxes = document.querySelectorAll<HTMLInputElement>(
    "input.project-cb",
  );
  const ids: string[] = [];
  checkboxes.forEach((cb) => {
    if (cb.checked && cb.dataset.id) ids.push(cb.dataset.id);
  });
  await bridge.setWatchedProjects(ids);
}

async function onSaveToken(): Promise<void> {
  console.log("[settings.ts] onSaveToken fired");
  const input = $("token") as HTMLInputElement;
  const token = input.value.trim();
  if (!token) {
    setStatus("Paste a token first", "error");
    return;
  }
  setStatus("Saving and validating…");
  try {
    const result = await bridge.setToken(token);
    console.log("[settings.ts] setToken result:", JSON.stringify(result));
    if (result.ok) {
      setStatus(`Signed in as @${result.username}`, "ok");
      input.value = "";
    } else {
      setStatus(result.error ?? "Could not save token", "error");
    }
  } catch (err) {
    console.error("[settings.ts] setToken threw:", err);
    setStatus(
      "IPC error: " + (err instanceof Error ? err.message : String(err)),
      "error",
    );
  }
}

async function onClearToken(): Promise<void> {
  await bridge.clearToken();
  setStatus("No token set");
}

async function onToggleAllProjects(): Promise<void> {
  const btn = $("toggle-all-projects") as HTMLButtonElement;
  const mode = btn.dataset.mode === "deselect" ? "deselect" : "select";
  const ids = mode === "select" ? currentProjects.map((p) => p.id) : [];
  await bridge.setWatchedProjects(ids);
}

async function onRefreshProjects(): Promise<void> {
  const btn = $("refresh-projects") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Refreshing…";
  try {
    await bridge.refreshProjects();
  } finally {
    btn.disabled = false;
    btn.textContent = "Refresh";
  }
}

async function onIntervalChange(e: Event): Promise<void> {
  const v = parseInt((e.target as HTMLInputElement).value, 10);
  if (Number.isFinite(v)) {
    await bridge.setPollInterval(v);
  }
}

async function onLaunchAtLoginChange(e: Event): Promise<void> {
  await bridge.setLaunchAtLogin((e.target as HTMLInputElement).checked);
}

async function onNotificationDurationChange(e: Event): Promise<void> {
  const v = parseInt((e.target as HTMLSelectElement).value, 10);
  if (Number.isFinite(v) && v >= 0) {
    await bridge.setNotificationDuration(v);
  }
}

async function onTokensLinkClick(e: Event): Promise<void> {
  e.preventDefault();
  await bridge.openExternal("https://vercel.com/account/tokens");
}

async function init(): Promise<void> {
  const config = await bridge.getConfig();
  render(config);

  $("save-token").addEventListener("click", onSaveToken);
  $("clear-token").addEventListener("click", onClearToken);
  $("toggle-all-projects").addEventListener("click", onToggleAllProjects);
  $("refresh-projects").addEventListener("click", onRefreshProjects);
  $("tokens-link").addEventListener("click", onTokensLinkClick);
  ($("interval") as HTMLInputElement).addEventListener(
    "change",
    onIntervalChange,
  );
  ($("launch-at-login") as HTMLInputElement).addEventListener(
    "change",
    onLaunchAtLoginChange,
  );
  ($("notification-duration") as HTMLSelectElement).addEventListener(
    "change",
    onNotificationDurationChange,
  );
  ($("token") as HTMLInputElement).addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") void onSaveToken();
  });

  bridge.onConfigChanged(render);
}

void init();
})();
