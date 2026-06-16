import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type GitChangedFilesResult =
  | {
      type: "git";
      files: string[];
    }
  | {
      type: "not-git";
      files: [];
    };

function parseNullSeparatedPaths(output: string): string[] {
  return output
    .split("\0")
    .filter(Boolean)
    .map(normalizeGitPath)
    .sort((left, right) => left.localeCompare(right));
}

function normalizeGitPath(path: string): string {
  return path.replaceAll("\\", "/");
}

function parsePorcelainStatus(output: string): string[] {
  const entries = output.split("\0").filter(Boolean);
  const files = new Set<string>();

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const status = entry.slice(0, 2);
    const path = entry.slice(3);

    if (!path || status === "!!") {
      continue;
    }

    if (status.includes("R") || status.includes("C")) {
      const destination = entries[index + 1];
      if (destination) {
        files.add(normalizeGitPath(destination));
        index += 1;
      }
      continue;
    }

    files.add(normalizeGitPath(path));
  }

  return [...files].sort((left, right) => left.localeCompare(right));
}

export async function getChangedGitFiles(
  cwd: string,
): Promise<GitChangedFilesResult> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      {
        cwd,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    return {
      type: "git",
      files: parsePorcelainStatus(stdout),
    };
  } catch {
    return {
      type: "not-git",
      files: [],
    };
  }
}

export async function getStagedGitFiles(
  cwd: string,
): Promise<GitChangedFilesResult> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMRT"],
      {
        cwd,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    return {
      type: "git",
      files: parseNullSeparatedPaths(stdout),
    };
  } catch {
    return {
      type: "not-git",
      files: [],
    };
  }
}

export async function getGitFilesSince(
  cwd: string,
  ref: string,
): Promise<GitChangedFilesResult> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--name-only", "-z", "--diff-filter=ACMRT", `${ref}...HEAD`],
      {
        cwd,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    return {
      type: "git",
      files: parseNullSeparatedPaths(stdout),
    };
  } catch {
    return {
      type: "not-git",
      files: [],
    };
  }
}

export async function getGitFilesFromStash(
  cwd: string,
  stashRef: string,
): Promise<GitChangedFilesResult> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      [
        "diff",
        "--name-only",
        "-z",
        "--diff-filter=ACMRT",
        `${stashRef}^1`,
        stashRef,
      ],
      {
        cwd,
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    return {
      type: "git",
      files: parseNullSeparatedPaths(stdout),
    };
  } catch {
    return {
      type: "not-git",
      files: [],
    };
  }
}

export async function readGitBlob(
  cwd: string,
  ref: string,
  relativePath: string,
): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    "git",
    ["show", `${ref}:${relativePath}`],
    {
      cwd,
      encoding: "buffer",
      maxBuffer: 50 * 1024 * 1024,
    },
  );

  return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
}
