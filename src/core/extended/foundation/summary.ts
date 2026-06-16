import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { ensureKontxtIgnoreFile } from "../../ignore-config.js";
import type { FileEntry } from "../../types.js";
import { countTokens } from "./tokenize.js";
import {
  formatContext,
  formatTree,
  getTreeInputPaths,
} from "./tree-building.js";

export type SplitTokenBudget = 32000 | 64000 | 128000;

export type SplitSummaryOutput = {
  budget: SplitTokenBudget;
  directory: string;
  paths: string[];
};

export type SummaryMode = {
  scope?: string;
  skeleton?: boolean;
};

const SPLIT_DIRECTORY_NAMES: Record<SplitTokenBudget, string> = {
  32000: "32k-token",
  64000: "64k-token",
  128000: "128k-token",
};

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if ((code >= 0 && code <= 31) || code === 127) {
      return true;
    }
  }
  return false;
}

function formatDatePrefix(): string {
  const date = new Date();
  return `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
}

function sanitizeModePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatSummaryModeLabel(mode: SummaryMode = {}): string {
  const parts = [mode.scope, mode.skeleton ? "skeleton" : undefined]
    .filter((part): part is string => part !== undefined && part.trim() !== "")
    .map(sanitizeModePart)
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return "full";
  }

  return parts.join("-");
}

export function resolveSummaryFileName(
  outputFileName?: string,
  mode: SummaryMode = {},
): string {
  if (!outputFileName) {
    return `${formatDatePrefix()}-${formatSummaryModeLabel(mode)}-summary.md`;
  }

  const trimmedName = outputFileName.trim();
  if (!trimmedName) {
    throw new Error("Invalid -o value: filename cannot be empty.");
  }
  if (trimmedName === "." || trimmedName === "..") {
    throw new Error("Invalid -o value: filename must not be '.' or '..'.");
  }
  if (hasControlCharacters(trimmedName)) {
    throw new Error("Invalid -o value: filename contains control characters.");
  }
  if (
    trimmedName !== basename(trimmedName) ||
    trimmedName.includes("/") ||
    trimmedName.includes("\\")
  ) {
    throw new Error(
      "Invalid -o value: only a filename is allowed (no path segments).",
    );
  }

  if (trimmedName.toLowerCase().endsWith(".md")) {
    return trimmedName;
  }

  return `${trimmedName}.md`;
}

export async function writeSummaryFile(
  basedir: string,
  content: string,
  outputFileName?: string,
  mode?: SummaryMode,
): Promise<string> {
  await ensureKontxtIgnoreFile(basedir);
  const fileName = resolveSummaryFileName(outputFileName, mode);
  const kontxtDir = join(basedir, ".kontxt");
  const summaryFilePath = join(kontxtDir, fileName);
  await mkdir(kontxtDir, { recursive: true });
  await writeFile(summaryFilePath, content, "utf-8");
  return summaryFilePath;
}

export function createSummaryContent(files: FileEntry[]): string {
  const tree = buildFullRepositoryTree(files);
  return formatContext(sortFiles(files), tree);
}

export function resolveSplitDirectoryName(budget: SplitTokenBudget): string {
  return SPLIT_DIRECTORY_NAMES[budget];
}

export function formatSplitBudgetLabel(budget: SplitTokenBudget): string {
  return `${budget / 1000}k`;
}

export function createSplitSummaryContents(
  files: FileEntry[],
  tokenBudget: number,
): string[] {
  const sortedFiles = sortFiles(files);
  const tree = buildFullRepositoryTree(sortedFiles);
  const treeOnlyContent = formatContext([], tree);
  const treeOnlyTokens = countTokens(treeOnlyContent);

  if (treeOnlyTokens > tokenBudget) {
    throw new Error(
      `Split budget of ${tokenBudget} tokens is too small: the full repository tree alone uses ${treeOnlyTokens} tokens.`,
    );
  }

  if (sortedFiles.length === 0) {
    return [treeOnlyContent];
  }

  const parts: string[] = [];
  let currentFiles: FileEntry[] = [];

  for (const file of sortedFiles) {
    const candidateFiles = [...currentFiles, file];
    const candidateContent = formatContext(candidateFiles, tree);
    if (countTokens(candidateContent) <= tokenBudget) {
      currentFiles = candidateFiles;
      continue;
    }

    if (currentFiles.length === 0) {
      throw new Error(
        `File "${file.relativePath}" cannot fit within the ${tokenBudget}-token split budget when combined with the full repository tree.`,
      );
    }

    parts.push(formatContext(currentFiles, tree));
    currentFiles = [file];

    const singleFileContent = formatContext(currentFiles, tree);
    if (countTokens(singleFileContent) > tokenBudget) {
      throw new Error(
        `File "${file.relativePath}" cannot fit within the ${tokenBudget}-token split budget when combined with the full repository tree.`,
      );
    }
  }

  if (currentFiles.length > 0) {
    parts.push(formatContext(currentFiles, tree));
  }

  return parts;
}

export async function writeSplitSummaryFiles(
  basedir: string,
  files: FileEntry[],
  budget: SplitTokenBudget,
  mode: SummaryMode = {},
): Promise<SplitSummaryOutput> {
  await ensureKontxtIgnoreFile(basedir);

  const contents = createSplitSummaryContents(files, budget);
  const splitDirectory = join(
    basedir,
    ".kontxt",
    resolveSplitDirectoryName(budget),
  );

  await mkdir(splitDirectory, { recursive: true });
  await deleteExistingMarkdownFiles(splitDirectory);

  const paths: string[] = [];
  const modeLabel = formatSummaryModeLabel(mode);
  for (const [index, content] of contents.entries()) {
    const fileName = `${formatDatePrefix()}-${modeLabel}-part-${String(index + 1).padStart(3, "0")}.md`;
    const filePath = join(splitDirectory, fileName);
    await writeFile(filePath, content, "utf-8");
    paths.push(filePath);
  }

  return {
    budget,
    directory: splitDirectory,
    paths,
  };
}

function buildFullRepositoryTree(files: FileEntry[]): string {
  return formatTree(getTreeInputPaths(sortFiles(files)));
}

function sortFiles(files: FileEntry[]): FileEntry[] {
  return [...files].sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );
}

async function deleteExistingMarkdownFiles(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  const markdownFiles = entries.filter((entry) => {
    return entry.isFile() && entry.name.toLowerCase().endsWith(".md");
  });

  await Promise.all(
    markdownFiles.map((entry) => unlink(join(directory, entry.name))),
  );
}
