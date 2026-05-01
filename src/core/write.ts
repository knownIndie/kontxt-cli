import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { getFiles } from "./filter.js";
import { ensureKontxtIgnoreFile } from "./ignore-config.js";
import type { FileEntry, TreeNode } from "./types.js";

export function buildTree(paths: string[]) {
  const tree: TreeNode = {};
  for (const path of paths) {
    let current = tree;
    const partOfPath = path.split("/");
    for (let i = 0; i < partOfPath.length; i++) {
      const lastIndex = i === partOfPath.length - 1;
      if (lastIndex) {
        current[partOfPath[i]] = null;
      } else if (!current[partOfPath[i]]) {
        current[partOfPath[i]] = {};
      }
      if (!lastIndex) current = current[partOfPath[i]] as TreeNode;
    }
  }
  return tree;
}

export function renderTree(node: TreeNode, prefix: string = ""): string {
  const keys = Object.keys(node);
  const lastConnector = "└── ";
  const normalConnector = "├── ";
  const newLine = "\n";
  const folderPostfix = "/";
  let result = "";
  keys.forEach((key, value) => {
    const isLast = value === keys.length - 1;
    const connector = isLast ? lastConnector : normalConnector;
    const childPrefix = isLast ? `${prefix}    ` : `${prefix}│   `;
    const isFolder = node[key] != null;
    result +=
      prefix + connector + key + (isFolder ? folderPostfix : "") + newLine;
    if (isFolder) {
      result += renderTree(node[key] as TreeNode, childPrefix);
    }
  });
  return result;
}

export function formatTree(paths: string[]): string {
  const tree = buildTree(paths);
  return renderTree(tree);
}

export async function getDirStructure(directory: string) {
  const treeExcludedFileNames = new Set([
    "bun.lock",
    "bun.lockb",
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    ".gitattributes",
    ".kontxtignore",
    ".gitignore",
    ".prettierignore",
    ".prettierconfig",
  ]);
  const ignoreExtensions = new Set([
    "mp4",
    "mp3",
    "wav",
    "ogg",
    "png",
    "jpg",
    "jpeg",
    "gif",
    "bmp",
    "tiff",
    "ico",
    "webp",
    "svg",
  ]);
  const files = await getFiles(directory);
  const dirStructure = [] as string[];

  for (const relativePath of files) {
    const fileName = relativePath.split("/").pop();
    const extension = fileName?.split(".").pop();
    if (extension && ignoreExtensions.has(extension)) {
      continue;
    }
    if (fileName && treeExcludedFileNames.has(fileName)) {
      continue;
    }
    dirStructure.push(relativePath);
  }

  return dirStructure;
}

export function formatContext(files: FileEntry[], tree: string) {
  const treeContent = `<tree>\n${tree}\n</tree>\n`;

  const convertedFile = files.map(
    (file) => `<file path="${file.relativePath}">\n${file.content}\n</file> \n`,
  );
  return [treeContent, ...convertedFile].join("\n");
}

export async function createSummaryFile(
  basedir: string,
  content: string,
  outputFileName?: string,
): Promise<void> {
  await ensureKontxtIgnoreFile(basedir);
  const fileName = resolveSummaryFileName(outputFileName);
  const kontxtDir = join(basedir, ".kontxt");
  const kontxtSummaryFileName = join(kontxtDir, fileName);

  await mkdir(kontxtDir, { recursive: true });
  await writeFile(kontxtSummaryFileName, content);
}

function resolveSummaryFileName(outputFileName?: string): string {
  if (!outputFileName) {
    const date = new Date();
    const dateString = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
    return `${dateString}-summary.md`;
  }

  const trimmedName = outputFileName.trim();
  if (!trimmedName) {
    throw new Error("Invalid --output value: filename cannot be empty.");
  }

  if (trimmedName === "." || trimmedName === "..") {
    throw new Error(
      "Invalid --output value: filename must not be '.' or '..'.",
    );
  }

  if (
    trimmedName !== basename(trimmedName) ||
    trimmedName.includes("/") ||
    trimmedName.includes("\\")
  ) {
    throw new Error(
      "Invalid --output value: only a filename is allowed (no path segments).",
    );
  }

  return trimmedName;
}
