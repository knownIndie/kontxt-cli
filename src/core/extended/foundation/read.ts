import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { FileEntry, SkipReason } from "../../types.js";
import { isBinaryFile } from "./binary.js";
import { READ_CONCURRENCY_LIMIT } from "./constants.js";
import { countTokens } from "./tokenize.js";

type ExtendedSkipResult = {
  type: "skipped";
  reason: SkipReason;
  path: string;
};

type ExtendedFileResult = {
  type: "file";
  file: FileEntry;
};

type ExtendedErrorResult = {
  type: "error";
  path: string;
  error: string;
};

export type ExtendedScanResult =
  | ExtendedSkipResult
  | ExtendedFileResult
  | ExtendedErrorResult;

function isWithinRoot(rootPath: string, absoluteFilePath: string): boolean {
  const rel = relative(rootPath, absoluteFilePath);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export async function readTextFile(absoluteFilePath: string): Promise<{
  content: string;
  sizeBytes: number;
}> {
  const selectedFile = await readFile(absoluteFilePath, "utf-8");
  const stats = await stat(absoluteFilePath);
  return {
    content: selectedFile,
    sizeBytes: stats.size,
  };
}

export async function scanPath(
  cwd: string,
  relativePath: string,
): Promise<ExtendedScanResult> {
  const absoluteRoot = resolve(cwd);
  const absoluteFilePath = resolve(absoluteRoot, relativePath);

  if (!isWithinRoot(absoluteRoot, absoluteFilePath)) {
    return {
      type: "error",
      path: relativePath,
      error: "Path escapes project root",
    };
  }

  try {
    const stats = await stat(absoluteFilePath);
    if (!stats.isFile()) {
      return {
        type: "skipped",
        reason: "excluded",
        path: relativePath,
      };
    }

    if (await isBinaryFile(absoluteFilePath)) {
      return {
        type: "skipped",
        reason: "binary",
        path: relativePath,
      };
    }

    const content = await readFile(absoluteFilePath, "utf-8");
    const tokenCount = countTokens(content);
    const fileEntry: FileEntry = {
      relativePath,
      absolutePath: absoluteFilePath,
      sizeBytes: stats.size,
      tokenCount,
      content,
    };
    return {
      type: "file",
      file: fileEntry,
    };
  } catch (error) {
    return {
      type: "error",
      path: relativePath,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function scanPaths(
  cwd: string,
  relativePaths: string[],
  concurrency: number = READ_CONCURRENCY_LIMIT,
): Promise<ExtendedScanResult[]> {
  if (relativePaths.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(concurrency, relativePaths.length));
  const results: ExtendedScanResult[] = new Array(relativePaths.length);
  let index = 0;

  const workers = Array.from({ length: limit }, async () => {
    while (true) {
      const currentIndex = index;
      index += 1;
      if (currentIndex >= relativePaths.length) {
        return;
      }
      results[currentIndex] = await scanPath(cwd, relativePaths[currentIndex]);
    }
  });

  await Promise.all(workers);
  return results;
}
