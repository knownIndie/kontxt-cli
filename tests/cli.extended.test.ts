import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { cleanupTempDir, makeTempDir, writeFixtureFile } from "./helpers/temp";

type RunResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

const repoRoot = resolve(import.meta.dir, "..");
const cliPath = join(repoRoot, "dist", "index.js");
let tempDirs: string[] = [];

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
    expect(result.stdout).toContain("Repository Tree");
    expect(result.stdout).toContain("src/");
    expect(result.stdout).toContain("tree.ts");
    expect(result.stdout).not.toContain("Model cost estimates");
    expect(result.stdout).not.toContain("Estimated Input Cost");
    expect(existsSync(join(tempDir, ".kontxt"))).toBe(false);
  });

  test("kontxt -e -o creates default dated summary file", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);
    await writeFixtureFile(tempDir, "src/a.ts", "export const a = 1;");

    const result = await runCliWithFrozenDate(tempDir, ["-e", "-o"]);

    expect(result.code).toBe(0);
    const summaryPath = join(tempDir, ".kontxt", "6-4-2026-summary.md");
    expect(existsSync(summaryPath)).toBe(true);
    const content = await readFile(summaryPath, "utf-8");
    expect(content).toContain('<file path="src/a.ts">');
    expect(result.stdout).toContain("Skipped Files");
    expect(result.stdout).toContain("Model cost estimates");
    expect(result.stdout).toContain("openai/gpt-5.4");
    expect(result.stdout).toContain("anthropic/claude-opus-4.6");
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
    expect(existsSync(join(tempDir, ".kontxt", "32k-token", "part-001.md"))).toBe(
      true,
    );
    expect(existsSync(join(tempDir, ".kontxt", "32k-token", "part-002.md"))).toBe(
      true,
    );
    expect(existsSync(join(tempDir, ".kontxt", "6-4-2026-summary.md"))).toBe(false);
    expect(result.stdout).toContain("Split Directory");
    expect(result.stdout).toContain("Split Budget: 32k");
    expect(result.stdout).toContain("Summary Parts: 2");
  });

  test("kontxt -e split flags route to the correct directories", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);
    await writeFixtureFile(tempDir, "src/a.ts", "export const a = 1;");

    const result64 = await runCliWithFrozenDate(tempDir, ["-e", "--64k"]);
    const result128 = await runCliWithFrozenDate(tempDir, ["-e", "--128k"]);

    expect(result64.code).toBe(0);
    expect(result128.code).toBe(0);
    expect(existsSync(join(tempDir, ".kontxt", "64k-token", "part-001.md"))).toBe(
      true,
    );
    expect(existsSync(join(tempDir, ".kontxt", "128k-token", "part-001.md"))).toBe(
      true,
    );
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
});
