//  File for filtering through files and checking if we should actually read this file.

import { readFile as readFilefunc, stat } from "node:fs/promises";
import { join } from "node:path";
import { globby } from "globby";
import { getEncoding } from "js-tiktoken";
import { getEffectiveIgnoreGlobs } from "./ignore-config.js";
import type { FileEntry, TokenType } from "./types.js";

export async function getFiles(directory: string): Promise<string[]> {
  const ignorePatterns = await getEffectiveIgnoreGlobs(directory);
  const path = await globby(["**/*"], {
    cwd: directory,
    expandDirectories: true,
    gitignore: true,
    ignore: ignorePatterns,
    dot: true,
    onlyFiles: true,
  });

  return path;
}

export async function readOneFile(
  absolutePath: string,
  relativePath: string,
): Promise<FileEntry> {
  const absoluteFilePath = join(absolutePath, relativePath);
  const selectedFile = await readFilefunc(absoluteFilePath, "utf-8");
  const stats = await stat(absoluteFilePath);
  const encode = getEncoding("cl100k_base");
  const tokenCount = encode.encode(selectedFile).length as TokenType;
  return {
    relativePath,
    absolutePath: absoluteFilePath,
    sizeBytes: stats.size,
    tokenCount,
    content: selectedFile,
  };
}

export async function readAllFiles(absolutePath: string): Promise<FileEntry[]> {
  const files = await getFiles(absolutePath);
  const readfilePromise = files.map((file) => readOneFile(absolutePath, file));
  /*
Here we need to use filter.map because it allows us to create multiple arrays of promises, such as promise file one, file two, like this, so that it uh can be read all that, and the resolution can be given as to the read file promise, which can be resolved down here.
    */
  const fileContent = await Promise.all(readfilePromise);
  return fileContent;
}
