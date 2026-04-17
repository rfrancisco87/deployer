import { app } from "electron";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { DeploymentState } from "../shared/types";

export class StateStore {
  private states = new Map<string, DeploymentState>();
  private dirty = false;
  private filePath: string | null = null;
  private flushTimer: NodeJS.Timeout | null = null;

  async load(): Promise<void> {
    const fp = await this.getPath();
    if (!existsSync(fp)) return;
    try {
      const raw = await readFile(fp, "utf-8");
      const obj = JSON.parse(raw) as Record<string, DeploymentState>;
      this.states = new Map(Object.entries(obj));
    } catch {
      this.states = new Map();
    }
  }

  get(id: string): DeploymentState | undefined {
    return this.states.get(id);
  }

  set(id: string, state: DeploymentState): void {
    if (this.states.get(id) === state) return;
    this.states.set(id, state);
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      void this.doFlush();
    }, 500);
  }

  private async doFlush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    const fp = await this.getPath();
    const obj: Record<string, DeploymentState> = {};
    for (const [k, v] of this.states) obj[k] = v;
    try {
      await writeFile(fp, JSON.stringify(obj, null, 2), "utf-8");
    } catch (err) {
      this.dirty = true;
      console.error("Failed to write state store", err);
    }
  }

  private async getPath(): Promise<string> {
    if (this.filePath) return this.filePath;
    const dir = app.getPath("userData");
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
    this.filePath = path.join(dir, "state.json");
    return this.filePath;
  }
}
