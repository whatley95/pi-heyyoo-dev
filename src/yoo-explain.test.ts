import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateYooExplainParams } from "./yoo-explain.js";
import { buildExplainPrompt } from "./prompts.js";

describe("yoo-explain", () => {
  it("validates params with target", () => {
    const result = validateYooExplainParams({ target: "src/index.ts" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.params.target, "src/index.ts");
    }
  });

  it("rejects missing target", () => {
    const result = validateYooExplainParams({ context: "some context" });
    assert.equal(result.ok, false);
  });

  it("builds explain prompt with target and files", () => {
    const { system, user } = buildExplainPrompt(
      "export const x = 1;",
      "variable definition",
      "camelCase naming",
      "const demo in src/demo.ts:1 (exported)",
      [{ file: "src/demo.ts", content: "export const demo = 1;" }],
    );
    assert.match(system, /Explain the provided code/i);
    assert.match(user, /export const x = 1;/);
    assert.match(user, /src\/demo.ts/);
  });
});
