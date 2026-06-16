import process from "node:process";
import chalk from "chalk";
import { Command } from "commander";
import { discoverFiles } from "../core/extended/foundation/discovery.js";
import {
  formatSplitBudgetLabel,
  type SplitTokenBudget,
} from "../core/extended/foundation/summary.js";
import {
  filterTreePaths,
  formatTree as formatExtendedTree,
} from "../core/extended/foundation/tree-building.js";
import { runExtendedPhaseOne } from "../core/extended/pipeline/index.js";
import { readAllFiles } from "../core/filter.js";
import {
  createSummaryFile,
  formatContext,
  formatTree,
  getDirStructure,
} from "../core/write.js";

const program = new Command();

type RunOptions = {
  output?: string;
  changedOnly?: boolean;
  stagedOnly?: boolean;
  stashRef?: string;
  since?: string;
  skeleton?: boolean;
};

type ParsedOptions = {
  output?: string | boolean;
  e?: boolean;
  t?: boolean;
  "32k"?: boolean;
  "64k"?: boolean;
  "128k"?: boolean;
  changed?: boolean;
  staged?: boolean;
  stash?: string | boolean;
  since?: string;
  skeleton?: boolean;
};

function formatCurrency(value: number): string {
  return chalk.green(`$${value.toFixed(6)}`);
}

function section(title: string): void {
  console.log(chalk.bold.cyan(`\n${title}`));
}

function metric(label: string, value: string | number): void {
  console.log(`${chalk.dim(label.padEnd(28))} ${chalk.white(String(value))}`);
}

function printModelCostTable(
  rows: Array<{
    model: string;
    inputUsd: number;
    outputUsd: number;
    notes?: string;
  }>,
): void {
  const header = {
    model: "Model",
    input: "Input USD",
    output: "Output USD",
    notes: "Notes",
  };

  const tableRows = rows.map((row) => {
    return {
      model: row.model,
      input: formatCurrency(row.inputUsd),
      output: formatCurrency(row.outputUsd),
      notes: row.notes ?? "-",
    };
  });

  const widths = {
    model: Math.max(
      header.model.length,
      ...tableRows.map((row) => row.model.length),
    ),
    input: Math.max(
      header.input.length,
      ...tableRows.map((row) => row.input.length),
    ),
    output: Math.max(
      header.output.length,
      ...tableRows.map((row) => row.output.length),
    ),
    notes: Math.max(
      header.notes.length,
      ...tableRows.map((row) => row.notes.length),
    ),
  };

  const divider = `+-${"-".repeat(widths.model)}-+-${"-".repeat(widths.input)}-+-${"-".repeat(widths.output)}-+-${"-".repeat(widths.notes)}-+`;
  const formatRow = (values: {
    model: string;
    input: string;
    output: string;
    notes: string;
  }) => {
    return `| ${values.model.padEnd(widths.model)} | ${values.input.padEnd(widths.input)} | ${values.output.padEnd(widths.output)} | ${values.notes.padEnd(widths.notes)} |`;
  };

  console.log(chalk.dim(divider));
  console.log(
    chalk.bold(
      formatRow({
        model: header.model,
        input: header.input,
        output: header.output,
        notes: header.notes,
      }),
    ),
  );
  console.log(chalk.dim(divider));
  for (const row of tableRows) {
    console.log(formatRow(row));
  }
  console.log(chalk.dim(divider));
}

async function runLegacy(options: RunOptions): Promise<void> {
  console.log("Running Default behaviour for the the Kontxt-cli \n");
  const cwd = process.cwd();
  console.log(`Reading File for ${cwd} \n `);

  const output = await readAllFiles(cwd);

  let totalTokenCost = 0;

  const dirStruc = await getDirStructure(cwd); // this is going to get and give the directory structure
  const treeString = formatTree(dirStruc);

  console.log("\n======== Reading the following ======== \n");
  for (const item of output) {
    console.log(`Read :${item.relativePath}`);
    totalTokenCost += item.tokenCount;
  }
  const content = formatContext(output, treeString);
  await createSummaryFile(cwd, content, options.output);

  console.log("\n=============================");
  console.log(`Total Files Processed: ${output.length}`);
  console.log(`Total Codebase Tokens: ${totalTokenCost}`);
  console.log("=============================\n");
}

async function runExtended(
  options: RunOptions,
  splitBudget?: SplitTokenBudget,
): Promise<void> {
  const cwd = process.cwd();
  console.log(chalk.bold.cyan("Kontxt extended pipeline"));
  console.log(`${chalk.dim("Repository")} ${cwd}`);

  const result = await runExtendedPhaseOne({
    cwd,
    outputFileName: options.output,
    splitBudget,
    changedOnly: options.changedOnly,
    stagedOnly: options.stagedOnly,
    stashRef: options.stashRef,
    since: options.since,
    skeleton: options.skeleton,
  });

  section("Run summary");
  if (options.changedOnly) {
    metric("Input scope", "changed git files");
  }
  if (options.stagedOnly) {
    metric("Input scope", "staged git files");
  }
  if (options.stashRef !== undefined) {
    metric("Input scope", `git stash ${options.stashRef}`);
  }
  if (options.since !== undefined) {
    metric("Input scope", `git files since ${options.since}`);
  }
  if (options.skeleton) {
    metric("Content mode", "skeleton");
  }
  if (result.outputMode === "split") {
    metric("Split directory", result.splitDirectory);
    metric("Split budget", formatSplitBudgetLabel(result.splitBudget));
    metric("Summary parts", result.summaryPaths.length);
  } else {
    metric("Summary file", result.summaryPath);
  }
  metric("Files processed", result.report.processedFiles);
  metric("Codebase tokens", result.report.totalTokens);
  metric(
    `Input cost (${result.report.costModel})`,
    `$${result.report.estimatedInputCostUsd}`,
  );
  metric("Skipped files", result.report.skippedCount);
  metric("Errors", result.report.errorCount);

  section("Model cost estimates");
  printModelCostTable(result.report.modelCosts);

  if (result.report.excludedFiles.length > 0) {
    section("Excluded files");
    for (const excluded of result.report.excludedFiles) {
      console.log(
        `${chalk.yellow("-")} ${excluded.path} ${chalk.dim(`(${excluded.reason})`)}`,
      );
    }
  }

  if (result.report.errors.length > 0) {
    section("Read errors");
    for (const errored of result.report.errors) {
      console.log(`${chalk.red("-")} ${errored.path}: ${errored.error}`);
    }
  }
}

async function runTreeOnly(): Promise<void> {
  const cwd = process.cwd();
  const discovered = await discoverFiles(cwd);
  const treePaths = filterTreePaths(discovered);
  const tree = formatExtendedTree(treePaths);

  section("Repository tree");
  if (tree.length === 0) {
    console.log("(no files found)");
    return;
  }
  console.log(tree);
}

program
  .name("kontxt")
  .description("Package any codebase into AI-ready context")
  .version("0.1.1")
  .option("-e", "Run extended foundation pipeline")
  .option("-t", "Print repository tree only in terminal")
  .option("--32k", "Split extended summary output into 32k token parts")
  .option("--64k", "Split extended summary output into 64k token parts")
  .option("--128k", "Split extended summary output into 128k token parts")
  .option("--changed", "Only include changed, staged, and untracked git files")
  .option("--staged", "Only include staged git files")
  .option("--stash [ref]", "Only include files from a git stash ref")
  .option("--since <ref>", "Only include files changed since a git ref")
  .option("--skeleton", "Use lightweight JS/TS skeletons where supported")
  .option(
    "-o, --output [name]",
    "Generate summary in .kontxt/ (optional custom file name)",
  );

function printUtilityInfo(): void {
  console.log(
    "Kontxt is a utility to package your codebase into AI-ready context.",
  );
  console.log(
    "Use `kontxt -o` for default output or `kontxt -o <name>` for custom output.",
  );
  console.log("Use `kontxt -e` to run the extended Phase 1 pipeline.");
  console.log(
    "Use `kontxt -e --32k`, `--64k`, or `--128k` to export split summaries by token budget.",
  );
  console.log("Use `kontxt -e --changed` to package only changed git files.");
  console.log("Use `kontxt -e --staged` to package only staged git files.");
  console.log(
    "Use `kontxt -e --stash` to package files from latest git stash.",
  );
  console.log("Use `kontxt -e --since main` to package branch-diff files.");
  console.log("Use `kontxt -e --skeleton` to package JS/TS skeleton context.");
  console.log("Use `kontxt -t` to print only the repository tree.");
  console.log("Use `kontxt --help` to see all available options.");
}

function getSplitBudget(options: ParsedOptions): SplitTokenBudget | undefined {
  const selected = [
    options["32k"] ? (32000 as const) : undefined,
    options["64k"] ? (64000 as const) : undefined,
    options["128k"] ? (128000 as const) : undefined,
  ].filter((budget): budget is SplitTokenBudget => budget !== undefined);

  if (selected.length > 1) {
    throw new Error(
      "Only one split token flag can be used at a time: choose --32k, --64k, or --128k.",
    );
  }

  return selected[0];
}

async function main(): Promise<void> {
  try {
    program.parse(process.argv);

    if (process.argv.length <= 2) {
      printUtilityInfo();
      return;
    }

    const options = program.opts<ParsedOptions>();
    const splitBudget = getSplitBudget(options);

    if (splitBudget !== undefined && !options.e) {
      throw new Error(
        "Split token flags require -e. Use `kontxt -e --32k`, `--64k`, or `--128k`.",
      );
    }

    if (splitBudget !== undefined && options.output !== undefined) {
      throw new Error("Split token flags cannot be combined with -o/--output.");
    }

    const gitScopeCount = [
      options.changed,
      options.staged,
      options.stash !== undefined,
      options.since !== undefined,
    ].filter(Boolean).length;
    if (gitScopeCount > 1) {
      throw new Error(
        "Use only one git scope flag: --changed, --staged, --stash, or --since.",
      );
    }

    const normalizedOptions: RunOptions = {
      output: typeof options.output === "string" ? options.output : undefined,
      changedOnly: options.changed,
      stagedOnly: options.staged,
      stashRef:
        options.stash === true
          ? "stash@{0}"
          : typeof options.stash === "string"
            ? options.stash
            : undefined,
      since: options.since,
      skeleton: options.skeleton,
    };

    if (options.t) {
      await runTreeOnly();
      return;
    }

    if (options.e) {
      await runExtended(normalizedOptions, splitBudget);
      return;
    }

    if (options.output !== undefined) {
      await runLegacy(normalizedOptions);
      return;
    }

    printUtilityInfo();
  } catch (error) {
    console.error("Critical Failure:", error);
    process.exitCode = 1;
  }
}

void main();
