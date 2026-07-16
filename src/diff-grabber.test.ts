import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyExclude,
  extractChangedFiles,
  splitDiffByFile,
  splitDiffByHunk,
  processDiff,
  DEFAULT_MAX_DIFF_CHARS,
} from "./diff-grabber.js";

describe("diff-grabber helpers", () => {
  it("excludes matching SVN blocks", () => {
    const diff = [
      "Index: src/a.ts",
      "===================================================================",
      "--- src/a.ts",
      "+++ src/a.ts",
      "change a",
      "Index: src/b.ts",
      "===================================================================",
      "--- src/b.ts",
      "+++ src/b.ts",
      "change b",
    ].join("\n");
    const filtered = applyExclude(diff, ["src/a.ts"]);
    assert.match(filtered, /src\/b\.ts/);
    assert.doesNotMatch(filtered, /change a/);
  });

  it("extracts git changed files", () => {
    const diff = "diff --git a/src/foo.ts b/src/foo.ts\n--- a/src/foo.ts\n+++ b/src/foo.ts";
    const files = extractChangedFiles(diff, "git");
    assert.deepEqual(files, ["src/foo.ts"]);
  });

  it("extracts svn changed files", () => {
    const diff = "Index: src/bar.ts\n===================================================================\nchange";
    const files = extractChangedFiles(diff, "svn");
    assert.deepEqual(files, ["src/bar.ts"]);
  });

  it("splits git diff by file", () => {
    const diff = ["diff --git a/src/a.ts b/src/a.ts", "change a", "diff --git a/src/b.ts b/src/b.ts", "change b"].join(
      "\n",
    );
    const byFile = splitDiffByFile(diff, "git");
    assert.ok(byFile["src/a.ts"]?.includes("change a"));
    assert.ok(byFile["src/b.ts"]?.includes("change b"));
    assert.ok(!byFile["src/a.ts"]?.includes("change b"));
  });

  it("splits svn diff by file", () => {
    const diff = [
      "Index: src/a.ts",
      "===================================================================",
      "change a",
      "Index: src/b.ts",
      "===================================================================",
      "change b",
    ].join("\n");
    const byFile = splitDiffByFile(diff, "svn");
    assert.ok(byFile["src/a.ts"]?.includes("change a"));
    assert.ok(byFile["src/b.ts"]?.includes("change b"));
  });

  it("returns empty record for empty diff", () => {
    const byFile = splitDiffByFile("", "git");
    assert.deepEqual(Object.keys(byFile), []);
  });

  it("parses quoted git paths with spaces", () => {
    const diff = 'diff --git "a/path with spaces.ts" "b/path with spaces.ts"\n+change';
    assert.deepEqual(extractChangedFiles(diff, "git"), ["path with spaces.ts"]);
    const byFile = splitDiffByFile(diff, "git");
    assert.ok(byFile["path with spaces.ts"]?.includes("+change"));
  });

  it("parses combined merge diff headers", () => {
    const diff = "diff --cc src/merged.ts\n+change";
    assert.deepEqual(extractChangedFiles(diff, "git"), ["src/merged.ts"]);
    const byFile = splitDiffByFile(diff, "git");
    assert.ok(byFile["src/merged.ts"]?.includes("+change"));
  });

  it("defaults to a large max diff char limit", () => {
    assert.equal(DEFAULT_MAX_DIFF_CHARS, 200_000);
  });

  it("does not truncate diffs larger than the old default", () => {
    const diff = "diff --git a/src/foo.ts b/src/foo.ts\n+" + "x".repeat(7000);
    const result = processDiff(diff, "git", DEFAULT_MAX_DIFF_CHARS);
    assert.equal(result.truncated, false);
    assert.ok(result.diff.length > 6000);
  });

  it("still truncates diffs that exceed the max char limit", () => {
    const diff = "diff --git a/src/foo.ts b/src/foo.ts\n+" + "x".repeat(300);
    const result = processDiff(diff, "git", 250);
    assert.equal(result.truncated, true);
    assert.ok(result.diff.endsWith("\n... diff truncated (too large)"));
  });

  it("does not exclude prefix-matching SVN blocks", () => {
    const diff = [
      "Index: src/a.ts",
      "===================================================================",
      "--- src/a.ts",
      "+++ src/a.ts",
      "change a",
      "Index: src/a.ts.bak",
      "===================================================================",
      "--- src/a.ts.bak",
      "+++ src/a.ts.bak",
      "change backup",
    ].join("\n");
    const filtered = applyExclude(diff, ["src/a.ts"]);
    assert.doesNotMatch(filtered, /change a/);
    assert.match(filtered, /change backup/);
  });

  it("splits a file diff by hunk", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,3 +1,3 @@",
      " line1",
      "-line2",
      "+line2a",
      " line3",
      "@@ -10,3 +10,3 @@",
      " line10",
      "-line11",
      "+line11a",
      " line12",
    ].join("\n");
    const hunks = splitDiffByHunk(diff);
    assert.equal(hunks.length, 2);
    assert.match(hunks[0], /@@ -1,3/);
    assert.match(hunks[1], /@@ -10,3/);
    assert.match(hunks[0], /line2a/);
    assert.match(hunks[1], /line11a/);
  });
});
