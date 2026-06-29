import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HeyyoSessionState } from "./types.js";

function getStateDir(cwd: string): string {
  return join(cwd, ".pi", "heyyo");
}

function getPlanPath(cwd: string): string {
  return join(getStateDir(cwd), "plan.json");
}

export function loadState(cwd: string): HeyyoSessionState | null {
  const path = getPlanPath(cwd);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    return {
      plan: data.plan as HeyyoSessionState["plan"] | undefined,
      completedSteps: typeof data.completedSteps === "number" ? data.completedSteps : 0,
      totalSteps: typeof data.totalSteps === "number" ? data.totalSteps : 0,
    };
  } catch {
    return null;
  }
}

export function saveState(cwd: string, state: HeyyoSessionState): void {
  const dir = getStateDir(cwd);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(getPlanPath(cwd), JSON.stringify({
    plan: state.plan,
    completedSteps: state.completedSteps,
    totalSteps: state.totalSteps,
  }, null, 2), { encoding: "utf-8", mode: 0o600 });
}

export function clearState(cwd: string): void {
  const path = getPlanPath(cwd);
  try {
    if (existsSync(path)) {
      writeFileSync(path, "{}", { encoding: "utf-8", mode: 0o600 });
    }
  } catch { /* ignore */ }
}