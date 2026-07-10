import { readFileSync, statSync } from "node:fs";
import { logEvent } from "./logger.js";
import { parseJsonResponse } from "./prompts.js";
import { runPreReviewCommands } from "./pre-review.js";
import { resolveProjectPath } from "./path-security.js";
import { mergeUsageCost } from "./actions/shared.js";
import type { CallSecondaryModelOptions, UsageCost } from "./types.js";

export interface ToolRequest {
  tool: "read_file" | "run_command";
  path?: string;
  command?: string;
}

export interface ToolResult {
  output: string;
  error?: string;
}

const DEFAULT_MAX_ITERATIONS = 3;
const MAX_TOOL_FILE_BYTES = 100 * 1024;
const MAX_TOOL_OUTPUT_CHARS = 4000;

function buildToolInstruction(maxIterations: number): string {
  return `You may request additional context before producing your final structured JSON result. To request context, output a single JSON block exactly like one of these examples and nothing else:

{"tool": "read_file", "path": "relative/path/to/file.ts"}
{"tool": "run_command", "command": "npm run typecheck"}

You may make up to ${maxIterations} such request(s). After each request, the tool result will be appended to this conversation. Once you have enough context, produce the final structured JSON result requested below. Do not output explanatory text with a tool request. If no additional context is needed, produce the final JSON result immediately.`;
}

function parseToolRequest(text: string): ToolRequest | null {
  const parsed = parseJsonResponse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (!("tool" in obj)) return null;
  const tool = obj.tool;
  if (tool !== "read_file" && tool !== "run_command") return null;
  return {
    tool,
    path: typeof obj.path === "string" ? obj.path : undefined,
    command: typeof obj.command === "string" ? obj.command : undefined,
  };
}

function truncateOutput(text: string): string {
  if (text.length <= MAX_TOOL_OUTPUT_CHARS) return text;
  return text.slice(0, MAX_TOOL_OUTPUT_CHARS) + "\n… (truncated)";
}

function readFileTool(cwd: string, path: string): ToolResult {
  const safePath = resolveProjectPath(cwd, path);
  if (!safePath) {
    return { output: "", error: `Path is not allowed: ${path}` };
  }
  try {
    const stats = statSync(safePath);
    if (stats.size > MAX_TOOL_FILE_BYTES) {
      const content = readFileSync(safePath, "utf-8");
      return { output: truncateOutput(content) };
    }
    const content = readFileSync(safePath, "utf-8");
    return { output: truncateOutput(content) };
  } catch (err) {
    return { output: "", error: err instanceof Error ? err.message : String(err) };
  }
}

async function runCommandTool(cwd: string, command: string): Promise<ToolResult> {
  try {
    const [result] = await runPreReviewCommands(cwd, [command]);
    return {
      output: truncateOutput(result.output),
      error: result.exitCode !== 0 ? `Command exited with code ${result.exitCode}` : undefined,
    };
  } catch (err) {
    return { output: "", error: err instanceof Error ? err.message : String(err) };
  }
}

async function executeTool(cwd: string, request: ToolRequest): Promise<ToolResult> {
  if (request.tool === "read_file") {
    if (!request.path) return { output: "", error: "read_file requires a path" };
    return readFileTool(cwd, request.path);
  }
  if (request.tool === "run_command") {
    if (!request.command) return { output: "", error: "run_command requires a command" };
    return runCommandTool(cwd, request.command);
  }
  return { output: "", error: `Unknown tool: ${request.tool}` };
}

function formatToolResult(request: ToolRequest, result: ToolResult): string {
  const description = request.tool === "read_file" ? `read_file ${request.path}` : `run_command ${request.command}`;
  const body = result.error ? `Error: ${result.error}\n${result.output}` : result.output;
  return `\n\n## Tool result: ${description}\n${body}\n\nYou may request another tool or produce the final structured JSON result.`;
}

export async function executeToolLoop(
  cwd: string,
  systemPrompt: string,
  userPrompt: string,
  options: CallSecondaryModelOptions,
  callModel: (
    system: string,
    user: string,
    opts: CallSecondaryModelOptions,
  ) => Promise<{ content: string; usage: UsageCost }>,
  maxToolIterations = DEFAULT_MAX_ITERATIONS,
): Promise<{ content: string; usage: UsageCost }> {
  const toolInstruction = buildToolInstruction(maxToolIterations);
  const augmentedSystem = `${toolInstruction}\n\n${systemPrompt}`;

  let currentUser = userPrompt;
  let totalUsage: UsageCost | undefined;

  for (let i = 0; i <= maxToolIterations; i++) {
    const { content, usage } = await callModel(augmentedSystem, currentUser, options);
    totalUsage = totalUsage ? mergeUsageCost(totalUsage, usage) : usage;

    const request = parseToolRequest(content);
    if (!request) {
      return { content, usage: totalUsage };
    }

    logEvent(cwd, "info", "Tool loop request", {
      iteration: i + 1,
      tool: request.tool,
      path: request.path,
      command: request.command,
    });

    if (i >= maxToolIterations) {
      currentUser +=
        "\n\nYou have reached the maximum number of tool requests. Please produce the final structured JSON result now without additional tools.";
      const final = await callModel(augmentedSystem, currentUser, options);
      totalUsage = mergeUsageCost(totalUsage, final.usage);
      return { content: final.content, usage: totalUsage };
    }

    const result = await executeTool(cwd, request);
    logEvent(cwd, "info", "Tool loop result", {
      iteration: i + 1,
      tool: request.tool,
      path: request.path,
      command: request.command,
      error: result.error,
      outputLength: result.output.length,
    });
    currentUser += formatToolResult(request, result);
  }

  return {
    content: currentUser,
    usage: totalUsage ?? { estimatedInputTokens: 0, estimatedOutputTokens: 0, estimatedCostUsd: 0, sessionCostUsd: 0 },
  };
}
