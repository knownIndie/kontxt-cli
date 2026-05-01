import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { cleanupTempDir, makeTempDir, writeFixtureFile } from "./helpers/temp";

type RunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

const repoRoot = resolve(import.meta.dir, "..");
const cliPath = join(repoRoot, "dist", "index.js");
let tempDirs: string[] = [];

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
const fixed = new RealDate("2026-04-05T10:00:00.000Z");
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

describe.skip("legacy cli behavior (deprecated)", () => {
  test("kontxt with no args prints utility info and exits success", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);

    const result = await runNode([cliPath], tempDir);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Kontxt is a utility");
    expect(result.stdout).toContain("kontxt -o");
  });

  test("kontxt -o creates default dated summary file", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);
    await writeFixtureFile(tempDir, "src/a.ts", "export const a = 1;");
    await writeFixtureFile(tempDir, "README.md", "# temp");

    const result = await runCliWithFrozenDate(tempDir, ["-o"]);

    expect(result.code).toBe(0);
    const summaryPath = join(tempDir, ".kontxt", "5-4-2026-summary.md");
    expect(existsSync(summaryPath)).toBe(true);
    const content = await readFile(summaryPath, "utf-8");
    expect(content).toContain("<tree>");
    expect(content).toContain('<file path="src/a.ts">');
  });

  test("kontxt -o custom.md creates custom summary file", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);
    await writeFixtureFile(tempDir, "src/b.ts", "export const b = 2;");

    const result = await runCliWithFrozenDate(tempDir, ["-o", "custom.md"]);

    expect(result.code).toBe(0);
    const summaryPath = join(tempDir, ".kontxt", "custom.md");
    expect(existsSync(summaryPath)).toBe(true);
  });

  test("kontxt -o nested/custom.md exits non-zero and reports validation error", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);
    await writeFixtureFile(tempDir, "src/c.ts", "export const c = 3;");

    const result = await runCliWithFrozenDate(tempDir, [
      "-o",
      "nested/custom.md",
    ]);

    expect(result.code).toBe(1);
    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    expect(combinedOutput).toContain("only a filename is allowed");
  });
});
