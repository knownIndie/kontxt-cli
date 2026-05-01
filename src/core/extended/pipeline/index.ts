import type { FileEntry } from "../../types.js";
import { discoverFiles } from "../foundation/discovery.js";
import { scanPaths } from "../foundation/read.js";
import {
  buildRunReport,
  getFilesFromResults,
  type RunReport,
} from "../foundation/report.js";
import {
  createSummaryContent,
  type SplitTokenBudget,
  writeSplitSummaryFiles,
  writeSummaryFile,
} from "../foundation/summary.js";

export type ExtendedRunInput = {
  cwd: string;
  outputFileName?: string;
  splitBudget?: SplitTokenBudget;
};

export type ExtendedRunOutput = {
  files: FileEntry[];
  report: RunReport;
} & (
  | {
      outputMode: "single";
      summaryPath: string;
    }
  | {
      outputMode: "split";
      summaryPaths: string[];
      splitDirectory: string;
      splitBudget: SplitTokenBudget;
    }
);

export async function runExtendedPhaseOne({
  cwd,
  outputFileName,
  splitBudget,
}: ExtendedRunInput): Promise<ExtendedRunOutput> {
  const discoveredFiles = await discoverFiles(cwd);
  const scanResults = await scanPaths(cwd, discoveredFiles);
  const files = getFilesFromResults(scanResults);
  const report = buildRunReport(scanResults);

  if (splitBudget !== undefined) {
    const splitOutput = await writeSplitSummaryFiles(cwd, files, splitBudget);
    return {
      files,
      outputMode: "split",
      summaryPaths: splitOutput.paths,
      splitDirectory: splitOutput.directory,
      splitBudget: splitOutput.budget,
      report,
    };
  }

  const context = createSummaryContent(files);
  const summaryPath = await writeSummaryFile(cwd, context, outputFileName);

  return {
    files,
    outputMode: "single",
    summaryPath,
    report,
  };
}
