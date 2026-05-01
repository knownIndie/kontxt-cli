import process from "node:process";
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
};

type ParsedOptions = {
  output?: string | boolean;
  e?: boolean;
  t?: boolean;
  "32k"?: boolean;
  "64k"?: boolean;
  "128k"?: boolean;
};

function formatCurrency(value: number): string {
  return `$${value.toFixed(6)}`;
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

  console.log(divider);
  console.log(
    formatRow({
      model: header.model,
      input: header.input,
      output: header.output,
      notes: header.notes,
    }),
  );
  console.log(divider);
  for (const row of tableRows) {
    console.log(formatRow(row));
  }
  console.log(divider);
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
  console.log("Running Extended Phase 1 pipeline\n");
  console.log(`Reading files for ${cwd}\n`);

  const result = await runExtendedPhaseOne({
    cwd,
    outputFileName: options.output,
    splitBudget,
  });

  console.log("\n=============================");
  if (result.outputMode === "split") {
    console.log(`Split Directory: ${result.splitDirectory}`);
    console.log(`Split Budget: ${formatSplitBudgetLabel(result.splitBudget)}`);
    console.log(`Summary Parts: ${result.summaryPaths.length}`);
  } else {
    console.log(`Summary File: ${result.summaryPath}`);
  }
  console.log(`Total Files Processed: ${result.report.processedFiles}`);
  console.log(`Total Codebase Tokens: ${result.report.totalTokens}`);
  console.log(
    `Estimated Input Cost (USD, ${result.report.costModel}): ${result.report.estimatedInputCostUsd}`,
  );
  console.log(`Skipped Files: ${result.report.skippedCount}`);
  console.log(`Errors: ${result.report.errorCount}`);
  console.log("=============================\n");

  console.log("Model cost estimates (USD for current token count):");
  printModelCostTable(result.report.modelCosts);
  console.log("");

  if (result.report.excludedFiles.length > 0) {
    console.log("Excluded files:");
    for (const excluded of result.report.excludedFiles) {
      console.log(`- ${excluded.path} (${excluded.reason})`);
    }
    console.log("");
  }

  if (result.report.errors.length > 0) {
    console.log("Read errors:");
    for (const errored of result.report.errors) {
      console.log(`- ${errored.path}: ${errored.error}`);
    }
    console.log("");
  }
}

async function runTreeOnly(): Promise<void> {
  const cwd = process.cwd();
  const discovered = await discoverFiles(cwd);
  const treePaths = filterTreePaths(discovered);
  const tree = formatExtendedTree(treePaths);

  console.log("Repository Tree\n");
  if (tree.length === 0) {
    console.log("(no files found)");
    return;
  }
  console.log(tree);
}

program
  .name("kontxt")
  .description("Package any codebase into AI-ready context")
  .version("0.0.1")
  .option("-e", "Run extended foundation pipeline")
  .option("-t", "Print repository tree only in terminal")
  .option("--32k", "Split extended summary output into 32k token parts")
  .option("--64k", "Split extended summary output into 64k token parts")
  .option("--128k", "Split extended summary output into 128k token parts")
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

    const normalizedOptions: RunOptions = {
      output: typeof options.output === "string" ? options.output : undefined,
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
