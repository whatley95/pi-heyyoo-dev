import test from "node:test";
import assert from "node:assert";
import { computeThinkingLevels, resolveModelThinkingDetails } from "./register.js";
import { setSdkGetModelOverride } from "../backends/sdk-backend.js";

const canonicalLevels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

test("computeThinkingLevels returns only off for non-reasoning models", () => {
  assert.deepStrictEqual(computeThinkingLevels({ reasoning: false }, canonicalLevels), ["off"]);
});

test("computeThinkingLevels falls back to canonical list when no map is provided", () => {
  assert.deepStrictEqual(computeThinkingLevels({}, canonicalLevels), canonicalLevels);
  assert.deepStrictEqual(computeThinkingLevels({ reasoning: true }, canonicalLevels), canonicalLevels);
  assert.deepStrictEqual(computeThinkingLevels(undefined, canonicalLevels), canonicalLevels);
});

test("computeThinkingLevels filters to advertised non-null levels plus off", () => {
  const modelDetails = {
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: "minimal",
      low: "low",
      medium: null,
      high: "high",
      xhigh: null,
      max: null,
    } as Record<string, string | null>,
  };
  assert.deepStrictEqual(computeThinkingLevels(modelDetails, canonicalLevels), ["off", "minimal", "low", "high"]);
});

test("computeThinkingLevels returns only off when every non-off level is unsupported", () => {
  const modelDetails = {
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: null,
      medium: null,
      high: null,
      xhigh: null,
      max: null,
    } as Record<string, string | null>,
  };
  assert.deepStrictEqual(computeThinkingLevels(modelDetails, canonicalLevels), ["off"]);
});

function fakeSdkModel(thinkingLevelMap?: Record<string, string | null>, reasoning = true) {
  return {
    id: "m",
    name: "m",
    api: "openai",
    provider: "p",
    baseUrl: "",
    reasoning,
    thinkingLevelMap,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };
}

test("resolveModelThinkingDetails prefers the SDK catalog map over the registry", async () => {
  setSdkGetModelOverride(() => fakeSdkModel({ off: null, high: "high", max: "max" }) as never);
  try {
    // Registry reports no map; SDK catalog should win.
    const details = await resolveModelThinkingDetails("deepseek", "deepseek-chat", { reasoning: true });
    assert.deepStrictEqual(details?.thinkingLevelMap, { off: null, high: "high", max: "max" });
    assert.deepStrictEqual(computeThinkingLevels(details, canonicalLevels), ["off", "high", "max"]);
  } finally {
    setSdkGetModelOverride(null);
  }
});

test("resolveModelThinkingDetails falls back to the registry when SDK catalog has no map", async () => {
  setSdkGetModelOverride(() => fakeSdkModel(undefined) as never);
  try {
    const registryMap = { off: null, high: "high" } as Record<string, string | null>;
    const details = await resolveModelThinkingDetails("deepseek", "deepseek-chat", {
      reasoning: true,
      thinkingLevelMap: registryMap,
    });
    assert.deepStrictEqual(details?.thinkingLevelMap, registryMap);
  } finally {
    setSdkGetModelOverride(null);
  }
});

test("resolveModelThinkingDetails returns registry details when SDK catalog is unavailable", async () => {
  setSdkGetModelOverride(() => {
    throw new Error("no sdk");
  });
  try {
    const registryMap = { off: null, max: "max" } as Record<string, string | null>;
    const details = await resolveModelThinkingDetails("deepseek", "deepseek-chat", {
      reasoning: true,
      thinkingLevelMap: registryMap,
    });
    assert.deepStrictEqual(details?.thinkingLevelMap, registryMap);
  } finally {
    setSdkGetModelOverride(null);
  }
});
