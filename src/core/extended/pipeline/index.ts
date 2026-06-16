import type { FileEntry } from "../../types.js";
import { discoverFiles, filterExistingFiles } from "../foundation/discovery.js";
import {
  getChangedGitFiles,
  getGitFilesFromStash,
  getGitFilesSince,
  getStagedGitFiles,
} from "../foundation/git.js";
import {
  type ExtendedScanResult,
  scanGitBlobPaths,
  scanPaths,
} from "../foundation/read.js";
import {
  buildRunReport,
  getFilesFromResults,
  type RunReport,
} from "../foundation/report.js";
import { skeletonizeFiles } from "../foundation/skeleton.js";
import {
  createSummaryContent,
  type SplitTokenBudget,
  type SummaryMode,
  writeSplitSummaryFiles,
  writeSummaryFile,
} from "../foundation/summary.js";

export type ExtendedRunInput = {
  cwd: string;
  outputFileName?: string;
  splitBudget?: SplitTokenBudget;
  changedOnly?: boolean;
  stagedOnly?: boolean;
  stashRef?: string;
  since?: string;
  skeleton?: boolean;
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
  changedOnly = false,
  stagedOnly = false,
  stashRef,
  since,
  skeleton = false,
}: ExtendedRunInput): Promise<ExtendedRunOutput> {
  const summaryMode = getSummaryMode({
    changedOnly,
    stagedOnly,
    stashRef,
    since,
    skeleton,
  });
  const scanResults = await getScanResults(cwd, {
    changedOnly,
    stagedOnly,
    stashRef,
    since,
  });
  const files = skeleton
    ? skeletonizeFiles(getFilesFromResults(scanResults))
    : getFilesFromResults(scanResults);
  const report = buildRunReport(replaceFileResults(scanResults, files));

  if (splitBudget !== undefined) {
    const splitOutput = await writeSplitSummaryFiles(
      cwd,
      files,
      splitBudget,
      summaryMode,
    );
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
  const summaryPath = await writeSummaryFile(
    cwd,
    context,
    outputFileName,
    summaryMode,
  );

  return {
    files,
    outputMode: "single",
    summaryPath,
    report,
  };
}

function getSummaryMode(input: {
  changedOnly: boolean;
  stagedOnly: boolean;
  stashRef?: string;
  since?: string;
  skeleton: boolean;
}): SummaryMode {
  let scope: string | undefined;
  if (input.changedOnly) {
    scope = "changed";
  } else if (input.stagedOnly) {
    scope = "staged";
  } else if (input.stashRef !== undefined) {
    scope = "stash";
  } else if (input.since !== undefined) {
    scope = `since-${input.since}`;
  }

  return {
    scope,
    skeleton: input.skeleton,
  };
}

async function getScanResults(
  cwd: string,
  options: {
    changedOnly: boolean;
    stagedOnly: boolean;
    stashRef?: string;
    since?: string;
  },
): Promise<ExtendedScanResult[]> {
  if (options.stashRef !== undefined) {
    const result = await getGitFilesFromStash(cwd, options.stashRef);
    if (result.type !== "git") {
      throw new Error(`Unable to read git stash "${options.stashRef}".`);
    }

    return scanGitBlobPaths(cwd, options.stashRef, result.files);
  }

  if (options.since !== undefined) {
    const result = await getGitFilesSince(cwd, options.since);
    if (result.type !== "git") {
      throw new Error(`Unable to read git diff since "${options.since}".`);
    }

    return scanPaths(cwd, await filterExistingFiles(cwd, result.files));
  }

  if (options.changedOnly) {
    return scanPaths(
      cwd,
      await filterExistingFiles(cwd, (await getChangedGitFiles(cwd)).files),
    );
  }

  if (options.stagedOnly) {
    return scanPaths(
      cwd,
      await filterExistingFiles(cwd, (await getStagedGitFiles(cwd)).files),
    );
  }

  return scanPaths(cwd, await discoverFiles(cwd));
}

function replaceFileResults(
  scanResults: ExtendedScanResult[],
  files: FileEntry[],
): ExtendedScanResult[] {
  const filesByPath = new Map(files.map((file) => [file.relativePath, file]));

  return scanResults.map((result) => {
    if (result.type !== "file") {
      return result;
    }

    return {
      type: "file",
      file: filesByPath.get(result.file.relativePath) ?? result.file,
    };
  });
}
