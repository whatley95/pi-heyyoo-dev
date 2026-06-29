import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { HeyyooConfig } from "./types.js";

let getAgentDirImpl: () => string;
try {
  const pi = await import("@earendil-works/pi-coding-agent");
  getAgentDirImpl = pi.getAgentDir;
} catch {
  getAgentDirImpl = () => join(homedir(), ".pi", "agent");
}

export function getAgentDir(): string {
  return getAgentDirImpl();
}

export function loadHeyyooConfig(cwd: string): HeyyooConfig {
  const agentDir = getAgentDir();
  const globalPath = join(agentDir, "settings.json");
  const projectPath = join(cwd, ".pi", "settings.json");

  let config: HeyyooConfig = {
    secondary: { provider: "", id: "", thinking: "xhigh" },
  };

  if (existsSync(globalPath)) {
    try {
      const global = JSON.parse(readFileSync(globalPath, "utf-8"));
      if (global["pi-heyyoo"]) {
        config = mergeConfig(config, global["pi-heyyoo"]);
      }
    } catch { /* ignore parse errors */ }
  }

  if (existsSync(projectPath)) {
    try {
      const project = JSON.parse(readFileSync(projectPath, "utf-8"));
      if (project["pi-heyyoo"]) {
        config = mergeConfig(config, project["pi-heyyoo"]);
      }
    } catch { /* ignore parse errors */ }
  }

  return config;
}

function mergeConfig(base: HeyyooConfig, override: Partial<HeyyooConfig>): HeyyooConfig {
  return {
    secondary: {
      provider: override.secondary?.provider || base.secondary.provider,
      id: override.secondary?.id || base.secondary.id,
      thinking: override.secondary?.thinking ?? base.secondary.thinking,
    },
  };
}
