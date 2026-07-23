import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getProjectConfigPath } from "./pi-paths.js";
import { logEvent } from "./logger.js";
import type { WaiModelTask } from "./types.js";

export interface RecentModel {
  provider: string;
  id: string;
  thinking: string;
  scope: "base" | WaiModelTask;
  usedAt: string;
}

const MAX_RECENT = 10;
const RECENT_FILE = "recent-models.json";

function getRecentModelsPath(cwd: string): string {
  return getProjectConfigPath(cwd, "yoowai", RECENT_FILE);
}

export function loadRecentModels(cwd: string): RecentModel[] {
  const path = getRecentModelsPath(cwd);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is RecentModel =>
        entry !== null &&
        typeof entry === "object" &&
        typeof (entry as RecentModel).provider === "string" &&
        typeof (entry as RecentModel).id === "string" &&
        typeof (entry as RecentModel).thinking === "string" &&
        typeof (entry as RecentModel).usedAt === "string" &&
        ((entry as RecentModel).scope === "base" || typeof (entry as RecentModel).scope === "string"),
    );
  } catch (err) {
    logEvent(cwd, "warn", "Failed to load recent wai models", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export function saveRecentModel(cwd: string, model: Omit<RecentModel, "usedAt">): void {
  const path = getRecentModelsPath(cwd);
  const all = loadRecentModels(cwd).filter((m) => !(m.provider === model.provider && m.id === model.id));
  const entry: RecentModel = { ...model, usedAt: new Date().toISOString() };
  all.unshift(entry);
  const trimmed = all.slice(0, MAX_RECENT);
  try {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(trimmed, null, 2), { encoding: "utf-8", mode: 0o600 });
  } catch (err) {
    logEvent(cwd, "warn", "Failed to save recent wai model", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function formatRecentModel(model: RecentModel): string {
  const scopeLabel = model.scope === "base" ? "base" : model.scope;
  return `${model.provider}:${model.id} · ${model.thinking} · ${scopeLabel}`;
}
