// Mini notification window. Wrapped in an IIFE so top-level bindings
// don't leak to the global scope or collide with other renderer files.
(function miniMain(): void {

interface MiniPayload {
  deploymentId: string;
  projectName: string;
  outcome: "READY" | "ERROR" | "CANCELED";
  target: "Production" | "Preview";
  durationSeconds: number;
  branch: string | null;
}

interface MiniBridge {
  getMiniPayload(): Promise<MiniPayload | null>;
  openDeploymentDetail(id: string): Promise<void>;
  onMiniPayload(cb: (payload: MiniPayload | null) => void): () => void;
}

const bridge = (window as unknown as { deployer: MiniBridge }).deployer;

console.log("[mini.ts] loaded, bridge:", typeof bridge);

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
};

function outcomeClass(o: MiniPayload["outcome"]): string {
  if (o === "READY") return "ready";
  if (o === "ERROR") return "error";
  return "canceled";
}

function outcomeLabel(o: MiniPayload["outcome"]): string {
  if (o === "READY") return "succeeded";
  if (o === "ERROR") return "failed";
  return "was canceled";
}

function formatDuration(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function render(payload: MiniPayload | null): void {
  if (!payload) return;
  const dot = $("dot");
  dot.className = "dot " + outcomeClass(payload.outcome);
  ($("project") as HTMLElement).textContent = payload.projectName;
  const status = $("status");
  const branch = payload.branch ? ` · ${payload.branch}` : "";
  if (payload.outcome === "READY") {
    status.innerHTML = `${outcomeLabel(payload.outcome)} in <span class="duration">${formatDuration(payload.durationSeconds)}</span>${branch}`;
  } else {
    status.textContent = `${outcomeLabel(payload.outcome)}${branch}`;
  }
  ($("target") as HTMLElement).textContent = payload.target;
}

async function init(): Promise<void> {
  $("card").addEventListener("click", async () => {
    const payload = await bridge.getMiniPayload();
    if (payload) await bridge.openDeploymentDetail(payload.deploymentId);
  });

  bridge.onMiniPayload((p) => render(p));

  const initial = await bridge.getMiniPayload();
  render(initial);
}

void init();
})();
