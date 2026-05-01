import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { access, chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getFiles, readAllFiles, readOneFile } from "../src/core/filter";
import {
  buildTree,
  createSummaryFile,
  formatContext,
  formatTree,
  getDirStructure,
  renderTree,
} from "../src/core/write";
import { cleanupTempDir, makeTempDir, writeFixtureFile } from "./helpers/temp";

const RealDate = Date;
let tempDirs: string[] = [];

function freezeDate(isoDate: string) {
  const frozen = new RealDate(isoDate);
  class MockDate extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date>) {
      if (args.length === 0) {
        super(frozen);
        return;
      }
      // @ts-expect-error: Date constructor overloads are runtime-compatible.
      super(...args);
    }

    static now() {
      return frozen.getTime();
    }
  }

  mock.module("globalThis.Date", () => MockDate);
  // Bun tests run in a single process, so patch global Date directly.
  // @ts-expect-error: test override
  globalThis.Date = MockDate;
}

function restoreDate() {
  // @ts-expect-error: test override
  globalThis.Date = RealDate;
}

beforeEach(() => {
  restoreDate();
});

afterAll(async () => {
  restoreDate();
  await Promise.all(tempDirs.map((dir) => cleanupTempDir(dir)));
  tempDirs = [];
});

describe.skip("legacy write helpers (deprecated)", () => {
  test("buildTree + renderTree + formatTree produce expected shape", () => {
    const paths = ["src/cli/index.ts", "src/core/filter.ts", "README.md"];
    const tree = buildTree(paths);
    const rendered = renderTree(tree);
    const formatted = formatTree(paths);

    expect(rendered).toContain("src/");
    expect(rendered).toContain("cli/");
    expect(rendered).toContain("index.ts");
    expect(formatted).toContain("core/");
    expect(formatted).toContain("README.md");
  });

  test("formatContext includes tree and file blocks", () => {
    const context = formatContext(
      [
        {
          relativePath: "src/a.ts",
          absolutePath: "/tmp/src/a.ts",
          sizeBytes: 10,
          tokenCount: 1 as never,
          content: "export const a = 1;",
        },
      ],
      "└── src/\n    └── a.ts",
    );

    expect(context).toContain("<tree>");
    expect(context).toContain("</tree>");
    expect(context).toContain('<file path="src/a.ts">');
    expect(context).toContain("export const a = 1;");
  });
});

describe.skip("legacy createSummaryFile (deprecated)", () => {
  test("writes default dated filename when output name is omitted", async () => {
    freezeDate("2026-04-05T10:00:00.000Z");
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);

    await createSummaryFile(tempDir, "hello world");

    const summaryPath = join(tempDir, ".kontxt", "5-4-2026-summary.md");
    await access(summaryPath);
    const content = await readFile(summaryPath, "utf-8");
    expect(content).toBe("hello world");
  });

  test("writes custom filename under .kontxt", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);

    await createSummaryFile(tempDir, "custom output", "custom.md");

    const summaryPath = join(tempDir, ".kontxt", "custom.md");
    await access(summaryPath);
    const content = await readFile(summaryPath, "utf-8");
    expect(content).toBe("custom output");
  });

  test("creates .kontxtignore with usage comments when missing", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);

    await createSummaryFile(tempDir, "auto config", "auto.md");

    const ignorePath = join(tempDir, ".kontxtignore");
    await access(ignorePath);
    const ignoreContent = await readFile(ignorePath, "utf-8");
    expect(ignoreContent).toContain("# .kontxtignore");
    expect(ignoreContent).toContain("Add glob patterns");
    expect(ignoreContent).toContain("**/node_modules/**");
  });

  test("throws for invalid output filenames", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);

    await expect(createSummaryFile(tempDir, "x", " ")).rejects.toThrow(
      "filename cannot be empty",
    );
    await expect(createSummaryFile(tempDir, "x", ".")).rejects.toThrow(
      "must not be '.' or '..'",
    );
    await expect(createSummaryFile(tempDir, "x", "..")).rejects.toThrow(
      "must not be '.' or '..'",
    );
    await expect(
      createSummaryFile(tempDir, "x", "nested/custom.md"),
    ).rejects.toThrow("only a filename is allowed");
  });
});

describe.skip("legacy file discovery and read (deprecated)", () => {
  test("includes unknown and extensionless files in discovery outputs", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);

    await writeFixtureFile(tempDir, "src/feature.abcxyz", "custom format");
    await writeFixtureFile(tempDir, "src/NOEXT", "no extension file");
    await writeFixtureFile(tempDir, "src/image.png", "ignored by dir structure");

    const files = await getFiles(tempDir);
    expect(files).toContain("src/feature.abcxyz");
    expect(files).toContain("src/NOEXT");

    const dirStructure = await getDirStructure(tempDir);
    expect(dirStructure).toContain("src/feature.abcxyz");
    expect(dirStructure).toContain("src/NOEXT");
    expect(dirStructure).not.toContain("src/image.png");
  });

  test("getFiles applies ignore behavior", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);

    await writeFixtureFile(tempDir, "src/keep.ts", "export const keep = true;");
    await writeFixtureFile(tempDir, "node_modules/skip.js", "skip");
    await writeFixtureFile(tempDir, ".kontxt/skip.md", "skip");
    await writeFixtureFile(tempDir, "bun.lock", "skip");

    const files = await getFiles(tempDir);

    expect(files).toContain("src/keep.ts");
    expect(files).not.toContain("node_modules/skip.js");
    expect(files).not.toContain(".kontxt/skip.md");
    expect(files).not.toContain("bun.lock");
  });

  test("getFiles applies user patterns from .kontxtignore and de-dupes duplicates", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);

    await writeFixtureFile(tempDir, "src/keep.ts", "export const keep = true;");
    await writeFixtureFile(tempDir, "src/secret.txt", "do-not-include");
    await writeFixtureFile(tempDir, "src/generated.gen.ts", "generated");
    await writeFixtureFile(
      tempDir,
      ".kontxtignore",
      [
        "# user ignores",
        "src/secret.txt",
        "src/secret.txt",
        "*.gen.ts",
      ].join("\n"),
    );

    const files = await getFiles(tempDir);
    expect(files).toContain("src/keep.ts");
    expect(files).not.toContain("src/secret.txt");
    expect(files).not.toContain("src/generated.gen.ts");
  });

  test("readOneFile and readAllFiles return file metadata and content", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);

    await writeFixtureFile(
      tempDir,
      "src/sample.ts",
      "export const sample = 'ok';",
    );
    await writeFile(join(tempDir, ".gitignore"), "", "utf-8");

    const one = await readOneFile(tempDir, "src/sample.ts");
    expect(one.relativePath).toBe("src/sample.ts");
    expect(one.content).toContain("sample");
    expect(one.sizeBytes).toBeGreaterThan(0);
    expect(one.tokenCount).toBeGreaterThan(0);

    const all = await readAllFiles(tempDir);
    expect(all.length).toBe(2);
    const sample = all.find((entry) => entry.relativePath === "src/sample.ts");
    expect(sample).toBeDefined();
    expect(sample?.tokenCount).toBeGreaterThan(0);
  });

  test("readOneFile throws on unreadable path type (directory)", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);

    await writeFixtureFile(tempDir, "src/ok.ts", "export const ok = true;");

    await expect(readOneFile(tempDir, "src")).rejects.toThrow();
  });

  test("readAllFiles rejects when one discovered file cannot be read", async () => {
    const tempDir = await makeTempDir();
    tempDirs.push(tempDir);

    await writeFixtureFile(tempDir, "src/good.ts", "export const good = 1;");
    await writeFixtureFile(tempDir, "src/bad.ts", "export const bad = 2;");
    await chmod(join(tempDir, "src/bad.ts"), 0o000);

    try {
      await expect(readAllFiles(tempDir)).rejects.toThrow();
    } finally {
      await chmod(join(tempDir, "src/bad.ts"), 0o644);
    }
  });
});
