import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { cleanupTempDir, makeTempDir, writeFixtureFile } from "./helpers/temp";

type RunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

const repoRoot = resolve(import.meta.dir, "..");
const cliPath = join(repoRoot, "dist", "index.js");
let tempDirs: string[] = [];
const execFileAsync = promisify(execFile);

function makeTokenHeavyContent(minTokens: number): string {
  return "token ".repeat(minTokens);
}

function runNode(args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolveRun) => {
    const proc = spawn(process.execPath, args, { cwd });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      resolveRun({ code, stdout, stderr });
    });
  });
}

function runBun(args: string[], cwd: string): Promise<RunResult> {
  return new Promise((resolveRun) => {
    const proc = spawn("bun", args, { cwd });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      resolveRun({ code, stdout, stderr });
    });
  });
}

function runCliWithFrozenDate(cwd: string, cliArgs: string[]): Promise<RunResult> {
  const bootstrap = `
const RealDate = Date;
const fixed = new RealDate("2026-04-06T10:00:00.000Z");
class MockDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) {
      super(fixed);
      return;
    }
    super(...args);
  }
  static now() { return fixed.getTime(); }
}
globalThis.Date = MockDate;
process.argv = ["node", ${JSON.stringify(cliPath)}, ...${JSON.stringify(cliArgs)}];
await import(${JSON.stringify(`file://${cliPath}`)});
`;
  return runNode(["--input-type=module", "-e", bootstrap], cwd);
}

beforeAll(async () => {
  const build = await runBun(["run", "build"], repoRoot);
  expect(build.code).toBe(0);
  expect(existsSync(cliPath)).toBe(true);
}, 20_000);

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
  tempDirs = [];
});

describe("extended cli behavior", () => {
  test("kontxt -t prints tree only with no cost section", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);
    await writeFixtureFile(tempDir, "src/tree.ts", "export const tree = true;");

    const result = await runNode([cliPath, "-t"], tempDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Repository tree");
    expect(result.stdout).toContain("src/");
    expect(result.stdout).toContain("tree.ts");
    expect(result.stdout).not.toContain("Model cost estimates");
    expect(result.stdout).not.toContain("Input cost");
    expect(existsSync(join(tempDir, ".kontxt"))).toBe(false);
  });

  test("kontxt -e -o creates default dated summary file", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);
    await writeFixtureFile(tempDir, "src/a.ts", "export const a = 1;");

    const result = await runCliWithFrozenDate(tempDir, ["-e", "-o"]);

    expect(result.code).toBe(0);
    const summaryPath = join(tempDir, ".kontxt", "6-4-2026-full-summary.md");
    expect(existsSync(summaryPath)).toBe(true);
    const content = await readFile(summaryPath, "utf-8");
    expect(content).toContain('<file path="src/a.ts">');
    expect(result.stdout).toContain("Skipped files");
    expect(result.stdout).toContain("Model cost estimates");
    expect(result.stdout).toContain("openai/gpt-5.5");
    expect(result.stdout).toContain("anthropic/claude-opus-4.8");
    expect(result.stdout).toContain("google/gemini-2.5-flash");
  });

  test("kontxt -e -o <name> appends .md when missing", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);
    await writeFixtureFile(tempDir, "src/b.ts", "export const b = 2;");

    const result = await runCliWithFrozenDate(tempDir, ["-e", "-o", "custom"]);

    expect(result.code).toBe(0);
    expect(existsSync(join(tempDir, ".kontxt", "custom.md"))).toBe(true);
  });

  test("kontxt -e -o nested/custom.md exits non-zero with validation error", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);
    await writeFixtureFile(tempDir, "src/c.ts", "export const c = 3;");

    const result = await runCliWithFrozenDate(tempDir, [
      "-e",
      "-o",
      "nested/custom.md",
    ]);

    expect(result.code).toBe(1);
    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    expect(combinedOutput).toContain("only a filename is allowed");
  });

  test("kontxt -e --32k creates split outputs and not the single summary file", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);

    const content = makeTokenHeavyContent(20_000);
    await writeFixtureFile(tempDir, "src/a.ts", content);
    await writeFixtureFile(tempDir, "src/b.ts", content);

    const result = await runCliWithFrozenDate(tempDir, ["-e", "--32k"]);

    expect(result.code).toBe(0);
    expect(
      existsSync(join(tempDir, ".kontxt", "32k-token", "6-4-2026-full-part-001.md")),
    ).toBe(true);
    expect(
      existsSync(join(tempDir, ".kontxt", "32k-token", "6-4-2026-full-part-002.md")),
    ).toBe(true);
    expect(existsSync(join(tempDir, ".kontxt", "6-4-2026-full-summary.md"))).toBe(
      false,
    );
    expect(result.stdout).toContain("Split directory");
    expect(result.stdout).toContain("Split budget");
    expect(result.stdout).toContain("Summary parts");
  });

  test("kontxt -e split flags route to the correct directories", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);
    await writeFixtureFile(tempDir, "src/a.ts", "export const a = 1;");

    const result64 = await runCliWithFrozenDate(tempDir, ["-e", "--64k"]);
    const result128 = await runCliWithFrozenDate(tempDir, ["-e", "--128k"]);

    expect(result64.code).toBe(0);
    expect(result128.code).toBe(0);
    expect(
      existsSync(join(tempDir, ".kontxt", "64k-token", "6-4-2026-full-part-001.md")),
    ).toBe(true);
    expect(
      existsSync(join(tempDir, ".kontxt", "128k-token", "6-4-2026-full-part-001.md")),
    ).toBe(true);
  });

  test("kontxt --32k without -e exits non-zero with a usage error", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);
    await writeFixtureFile(tempDir, "src/a.ts", "export const a = 1;");

    const result = await runCliWithFrozenDate(tempDir, ["--32k"]);

    expect(result.code).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain("require -e");
  });

  test("kontxt -e --32k cannot be combined with -o", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);
    await writeFixtureFile(tempDir, "src/a.ts", "export const a = 1;");

    const result = await runCliWithFrozenDate(tempDir, [
      "-e",
      "--32k",
      "-o",
      "custom.md",
    ]);

    expect(result.code).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "cannot be combined with -o/--output",
    );
  });

  test("kontxt -e --skeleton writes skeleton content", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);
    await writeFixtureFile(
      tempDir,
      "src/skeleton.ts",
      [
        "export function skeleton(value: string) {",
        "  return value.toUpperCase();",
        "}",
      ].join("\n"),
    );

    const result = await runCliWithFrozenDate(tempDir, [
      "-e",
      "--skeleton",
      "-o",
      "skeleton",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Content mode");
    const content = await readFile(
      join(tempDir, ".kontxt", "skeleton.md"),
      "utf-8",
    );
    expect(content).toContain("export function skeleton(value: string) { ... }");
    expect(content).not.toContain("toUpperCase");
  });

  test("kontxt -e --since includes branch-diff files", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);

    await execFileAsync("git", ["init"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], {
      cwd: tempDir,
    });
    await execFileAsync("git", ["config", "user.name", "Test User"], {
      cwd: tempDir,
    });

    await writeFixtureFile(tempDir, "src/base.ts", "export const base = true;");
    await execFileAsync("git", ["add", "."], { cwd: tempDir });
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: tempDir });
    await execFileAsync("git", ["branch", "main"], { cwd: tempDir });

    await writeFixtureFile(
      tempDir,
      "src/feature.ts",
      "export const feature = true;",
    );
    await execFileAsync("git", ["add", "."], { cwd: tempDir });
    await execFileAsync("git", ["commit", "-m", "feature"], { cwd: tempDir });

    const result = await runCliWithFrozenDate(tempDir, [
      "-e",
      "--since",
      "main",
      "-o",
      "since",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Input scope");
    expect(result.stdout).toContain("git files since main");
    const content = await readFile(join(tempDir, ".kontxt", "since.md"), "utf-8");
    expect(content).toContain('<file path="src/feature.ts">');
    expect(content).not.toContain('<file path="src/base.ts">');
  });

  test("kontxt -e --staged includes only staged files", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);

    await execFileAsync("git", ["init"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], {
      cwd: tempDir,
    });
    await execFileAsync("git", ["config", "user.name", "Test User"], {
      cwd: tempDir,
    });

    await writeFixtureFile(tempDir, "src/base.ts", "export const base = true;");
    await execFileAsync("git", ["add", "."], { cwd: tempDir });
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: tempDir });

    await writeFixtureFile(tempDir, "src/staged.ts", "export const staged = true;");
    await writeFixtureFile(
      tempDir,
      "src/untracked.ts",
      "export const untracked = true;",
    );
    await execFileAsync("git", ["add", "src/staged.ts"], { cwd: tempDir });

    const result = await runCliWithFrozenDate(tempDir, [
      "-e",
      "--staged",
      "-o",
      "staged",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Input scope");
    expect(result.stdout).toContain("staged git files");
    const content = await readFile(join(tempDir, ".kontxt", "staged.md"), "utf-8");
    expect(content).toContain('<file path="src/staged.ts">');
    expect(content).not.toContain('<file path="src/untracked.ts">');
  });

  test("kontxt -e --stash includes latest stash files", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);

    await execFileAsync("git", ["init"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], {
      cwd: tempDir,
    });
    await execFileAsync("git", ["config", "user.name", "Test User"], {
      cwd: tempDir,
    });

    await writeFixtureFile(tempDir, "src/base.ts", "export const base = true;");
    await execFileAsync("git", ["add", "."], { cwd: tempDir });
    await execFileAsync("git", ["commit", "-m", "base"], { cwd: tempDir });

    await writeFixtureFile(
      tempDir,
      "src/stashed.ts",
      "export const stashed = 'from-stash';",
    );
    await execFileAsync("git", ["add", "src/stashed.ts"], { cwd: tempDir });
    await execFileAsync("git", ["stash", "push", "--include-untracked", "-m", "stash-test"], {
      cwd: tempDir,
    });
    await writeFixtureFile(
      tempDir,
      "src/stashed.ts",
      "export const stashed = 'from-worktree';",
    );

    const result = await runCliWithFrozenDate(tempDir, [
      "-e",
      "--stash",
      "-o",
      "stash",
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Input scope");
    expect(result.stdout).toContain("git stash stash@{0}");
    const content = await readFile(join(tempDir, ".kontxt", "stash.md"), "utf-8");
    expect(content).toContain('<file path="src/stashed.ts">');
    expect(content).toContain("from-stash");
    expect(content).not.toContain("from-worktree");
    expect(content).not.toContain('<file path="src/base.ts">');
  });

  test("kontxt -e --changed --since exits non-zero", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);

    const result = await runCliWithFrozenDate(tempDir, [
      "-e",
      "--changed",
      "--since",
      "main",
    ]);

    expect(result.code).toBe(1);
    expect(`${result.stdout}\n${result.stderr}`).toContain(
      "Use only one git scope flag",
    );
  });
});
