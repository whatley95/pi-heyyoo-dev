import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadRecentModels, saveRecentModel, formatRecentModel, type RecentModel } from "./model-history.js";

describe("model-history", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = join(tmpdir(), `wai-model-history-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(cwd, ".pi", "yoowai"), { recursive: true });
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
  });

  it("returns an empty array when no recent models file exists", () => {
    assert.deepStrictEqual(loadRecentModels(cwd), []);
  });

  it("ignores malformed entries when loading", () => {
    const path = join(cwd, ".pi", "yoowai", "recent-models.json");
    writeFileSync(
      path,
      JSON.stringify([
        { provider: "openai", id: "gpt-4o", thinking: "xhigh", scope: "base", usedAt: new Date().toISOString() },
        { provider: "anthropic", id: "claude-sonnet" },
        "not-an-object",
        null,
      ]),
    );
    const loaded = loadRecentModels(cwd);
    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0].provider, "openai");
    assert.strictEqual(loaded[0].scope, "base");
  });

  it("saves a recent model and reloads it", () => {
    saveRecentModel(cwd, { provider: "openai", id: "gpt-4o", thinking: "xhigh", scope: "base" });
    const loaded = loadRecentModels(cwd);
    assert.strictEqual(loaded.length, 1);
    assert.strictEqual(loaded[0].provider, "openai");
    assert.strictEqual(loaded[0].id, "gpt-4o");
    assert.strictEqual(loaded[0].thinking, "xhigh");
    assert.strictEqual(loaded[0].scope, "base");
    assert.ok(loaded[0].usedAt);
  });

  it("deduplicates recent models by provider:id and moves the latest to the front", () => {
    saveRecentModel(cwd, { provider: "openai", id: "gpt-4o", thinking: "xhigh", scope: "base" });
    saveRecentModel(cwd, { provider: "anthropic", id: "claude-sonnet", thinking: "high", scope: "review" });
    saveRecentModel(cwd, { provider: "openai", id: "gpt-4o", thinking: "low", scope: "done" });
    const loaded = loadRecentModels(cwd);
    assert.strictEqual(loaded.length, 2);
    assert.strictEqual(loaded[0].provider, "openai");
    assert.strictEqual(loaded[0].thinking, "low");
    assert.strictEqual(loaded[0].scope, "done");
    assert.strictEqual(loaded[1].provider, "anthropic");
  });

  it("caps the recent list at 10 entries", () => {
    for (let i = 0; i < 12; i++) {
      saveRecentModel(cwd, { provider: "openai", id: `model-${i}`, thinking: "xhigh", scope: "base" });
    }
    const loaded = loadRecentModels(cwd);
    assert.strictEqual(loaded.length, 10);
    assert.strictEqual(loaded[0].id, "model-11");
    assert.strictEqual(loaded[9].id, "model-2");
  });

  it("writes the file with restricted permissions", () => {
    saveRecentModel(cwd, { provider: "openai", id: "gpt-4o", thinking: "xhigh", scope: "base" });
    const path = join(cwd, ".pi", "yoowai", "recent-models.json");
    assert.ok(existsSync(path));
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as RecentModel[];
    assert.strictEqual(parsed[0].provider, "openai");
  });

  it("formats a recent model for display", () => {
    const model: RecentModel = {
      provider: "anthropic",
      id: "claude-sonnet-4-5",
      thinking: "high",
      scope: "review",
      usedAt: "2026-01-01T00:00:00.000Z",
    };
    assert.strictEqual(formatRecentModel(model), "anthropic:claude-sonnet-4-5 · high · review");
  });
});
