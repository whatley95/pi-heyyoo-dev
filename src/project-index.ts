import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import * as ts from "typescript";
import { filterSourceFiles, listTrackedFiles } from "./conventions.js";
import { logEvent } from "./logger.js";
import { getProjectConfigPath } from "./pi-paths.js";

export interface SymbolInfo {
  name: string;
  kind: string;
  line: number;
  exported: boolean;
  signature?: string;
}

export interface FileIndex {
  file: string;
  symbols: SymbolInfo[];
}

export interface ProjectIndex {
  generatedAt: string;
  files: FileIndex[];
}

const SUPPORTED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const MAX_FILE_BYTES = 500 * 1024;

function getIndexPath(cwd: string): string {
  return getProjectConfigPath(cwd, "heyyoo", "index.json");
}

export function loadProjectIndex(cwd: string): ProjectIndex | null {
  const path = getIndexPath(cwd);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidProjectIndex(parsed)) {
      logEvent(cwd, "warn", "Invalid project index shape; ignoring", { path });
      return null;
    }
    return parsed;
  } catch (err) {
    logEvent(cwd, "warn", "Failed to load project index", {
      error: err instanceof Error ? err.message : String(err),
      path,
    });
    return null;
  }
}

function isValidProjectIndex(value: unknown): value is ProjectIndex {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.generatedAt !== "string") return false;
  if (!Array.isArray(v.files)) return false;
  for (const f of v.files) {
    if (!f || typeof f !== "object" || Array.isArray(f)) return false;
    const file = f as Record<string, unknown>;
    if (typeof file.file !== "string") return false;
    if (!Array.isArray(file.symbols)) return false;
  }
  return true;
}

export function saveProjectIndex(cwd: string, index: ProjectIndex): void {
  try {
    const path = getIndexPath(cwd);
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(index, null, 2), { encoding: "utf-8", mode: 0o600 });
  } catch (err) {
    logEvent(cwd, "error", "Failed to save project index", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function buildProjectIndex(cwd: string): ProjectIndex {
  const tracked = listTrackedFiles(cwd);
  const files = filterSourceFiles(tracked).filter((f) => SUPPORTED_EXTENSIONS.has(getExtension(f)));

  const index: ProjectIndex = {
    generatedAt: new Date().toISOString(),
    files: [],
  };

  for (const rel of files) {
    const filePath = `${cwd}/${rel}`;
    const fileIndex = indexFile(cwd, filePath, rel);
    if (fileIndex && fileIndex.symbols.length > 0) {
      index.files.push(fileIndex);
    }
  }

  return index;
}

function getExtension(file: string): string {
  const lower = file.toLowerCase();
  if (lower.endsWith(".d.ts")) return ".ts";
  const dot = lower.lastIndexOf(".");
  return dot > 0 ? lower.slice(dot) : "";
}

function indexFile(cwd: string, filePath: string, relPath: string): FileIndex | undefined {
  try {
    const content = readFileSync(filePath, "utf-8");
    if (content.length > MAX_FILE_BYTES) {
      return { file: relPath, symbols: [] };
    }
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, getScriptKind(relPath));
    return { file: relPath, symbols: extractSymbols(sourceFile) };
  } catch (err) {
    logEvent(cwd, "warn", "Failed to index file", {
      file: relPath,
      error: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

function getScriptKind(fileName: string): ts.ScriptKind {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (lower.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (lower.endsWith(".ts")) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function isExported(node: ts.Node): boolean {
  const modifiers = (node as ts.HasModifiers).modifiers;
  return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

function extractSymbols(sourceFile: ts.SourceFile): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  function addSymbol(name: string, kind: string, node: ts.Node, includeSignature = false): void {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const exported = isExported(node);
    const signature = includeSignature ? extractSignature(sourceFile, node) : undefined;
    const symbol: SymbolInfo = { name, kind, line, exported };
    if (signature) {
      symbol.signature = signature;
    }
    symbols.push(symbol);
  }

  function visit(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node) && node.name) {
      addSymbol(node.name.text, "function", node, true);
      return;
    }
    if (ts.isClassDeclaration(node) && node.name) {
      addSymbol(node.name.text, "class", node);
      return;
    }
    if (ts.isInterfaceDeclaration(node)) {
      addSymbol(node.name.text, "interface", node);
      return;
    }
    if (ts.isTypeAliasDeclaration(node)) {
      addSymbol(node.name.text, "type", node);
      return;
    }
    if (ts.isEnumDeclaration(node)) {
      addSymbol(node.name.text, "enum", node);
      return;
    }
    if (ts.isModuleDeclaration(node) && ts.isIdentifier(node.name)) {
      addSymbol(node.name.text, "namespace", node);
      return;
    }
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          const kind = node.declarationList.flags & ts.NodeFlags.Const ? "const" : "variable";
          addSymbol(declaration.name.text, kind, node);
        }
      }
      return;
    }
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        const name = element.name.text;
        addSymbol(name, "export", element);
      }
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return symbols;
}

function extractSignature(sourceFile: ts.SourceFile, node: ts.Node): string | undefined {
  try {
    const text = node.getText(sourceFile);
    const firstLine = text.split(/\r?\n/)[0] ?? text;
    const trimmed = firstLine.trim();
    return trimmed.length > 0 && trimmed.length < 300 ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

export function formatIndexSummary(index: ProjectIndex, query?: string): string {
  const lines: string[] = [];
  const q = query?.toLowerCase();
  let totalSymbols = 0;
  for (const file of index.files) {
    const matches = q
      ? file.symbols.filter(
          (s) =>
            s.name.toLowerCase().includes(q) || s.kind.toLowerCase().includes(q) || file.file.toLowerCase().includes(q),
        )
      : file.symbols;
    if (matches.length === 0) continue;
    totalSymbols += matches.length;
    lines.push(`\n${file.file}:`);
    for (const s of matches.slice(0, 20)) {
      const exported = s.exported ? " (exported)" : "";
      const sig = s.signature ? ` — \`${s.signature}\`` : "";
      lines.push(`  - ${s.kind} ${s.name} at ${s.line}${exported}${sig}`);
    }
    if (matches.length > 20) {
      lines.push(`  ... and ${matches.length - 20} more symbols`);
    }
  }
  if (lines.length === 0) return q ? `No symbols match "${query}".` : "No symbols indexed.";
  return `Indexed ${totalSymbols} symbol(s) across ${index.files.length} file(s):\n` + lines.join("\n");
}
