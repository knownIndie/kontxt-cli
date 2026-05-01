import { constants as fsConstants } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const KONTXT_IGNORE_FILE = ".kontxtignore";

const DEFAULT_IGNORE_GLOBS = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.cursor/**",
  "**/.vscode/**",
  "**/.idea/**",
  "**/.DS_Store/**",
  "**/bun.lock",
  "**/bun.lockb",
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/.gitattributes",
  "**/.kontxt/**",
  "**/.kontxtignore",
  "**/dist/**",
];

function dedupePatterns(patterns: string[]): string[] {
  return [...new Set(patterns)];
}

function normalizeUserPattern(pattern: string): string {
  const isNegation = pattern.startsWith("!");
  const basePattern = isNegation ? pattern.slice(1) : pattern;
  if (!basePattern) {
    return pattern;
  }
  if (basePattern.includes("/") || basePattern.startsWith("**/")) {
    return pattern;
  }

  const normalized = `**/${basePattern}`;
  return isNegation ? `!${normalized}` : normalized;
}

function buildKontxtIgnoreTemplate(): string {
  const header = [
    "# .kontxtignore",
    "# Add glob patterns (one per line) to exclude files from kontxt processing.",
    "# Lines starting with # are comments.",
    "# Built-in defaults are included below. You can add more entries at the end.",
    "",
  ];
  return [...header, ...DEFAULT_IGNORE_GLOBS, ""].join("\n");
}

export async function ensureKontxtIgnoreFile(cwd: string): Promise<void> {
  const ignoreFilePath = join(cwd, KONTXT_IGNORE_FILE);
  try {
    await access(ignoreFilePath, fsConstants.F_OK);
    return;
  } catch {
    await writeFile(ignoreFilePath, buildKontxtIgnoreTemplate(), "utf-8");
  }
}

export async function readKontxtIgnorePatterns(cwd: string): Promise<string[]> {
  const ignoreFilePath = join(cwd, KONTXT_IGNORE_FILE);
  try {
    const content = await readFile(ignoreFilePath, "utf-8");
    const parsed = content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => normalizeUserPattern(line));
    return dedupePatterns(parsed);
  } catch {
    return [];
  }
}

export async function getEffectiveIgnoreGlobs(cwd: string): Promise<string[]> {
  const userPatterns = await readKontxtIgnorePatterns(cwd);
  return dedupePatterns([...DEFAULT_IGNORE_GLOBS, ...userPatterns]);
}

export function getDefaultIgnoreGlobs(): string[] {
  return [...DEFAULT_IGNORE_GLOBS];
}
