import type { FileEntry, SkipReason } from "../../types.js";
import { estimateInputCostUsd } from "./cost.js";
import {
  DEFAULT_COST_MODEL,
  MODEL_PRICING_USD_PER_1M,
  type ModelPriceId,
} from "./pricing.js";
import type { ExtendedScanResult } from "./read.js";

export type ExcludedFile = {
  path: string;
  reason: SkipReason;
};

export type ErrorFile = {
  path: string;
  error: string;
};

export type RunReport = {
  processedFiles: number;
  totalTokens: number;
  costModel: ModelPriceId;
  estimatedInputCostUsd: number;
  modelCosts: Array<{
    model: ModelPriceId;
    inputUsd: number;
    outputUsd: number;
    notes?: string;
  }>;
  skippedCount: number;
  skippedByReason: Record<SkipReason, number>;
  excludedFiles: ExcludedFile[];
  errorCount: number;
  errors: ErrorFile[];
};

export function getFilesFromResults(
  results: ExtendedScanResult[],
): FileEntry[] {
  return results
    .filter(
      (result): result is Extract<ExtendedScanResult, { type: "file" }> => {
        return result.type === "file";
      },
    )
    .map((result) => result.file);
}

export function buildRunReport(
  results: ExtendedScanResult[],
  model: ModelPriceId = DEFAULT_COST_MODEL,
): RunReport {
  const skippedByReason: Record<SkipReason, number> = {
    binary: 0,
    excluded: 0,
    tooLarge: 0,
  };
  const excludedFiles: ExcludedFile[] = [];
  const errors: ErrorFile[] = [];
  let processedFiles = 0;
  let totalTokens = 0;

  for (const result of results) {
    if (result.type === "file") {
      processedFiles += 1;
      totalTokens += result.file.tokenCount;
      continue;
    }

    if (result.type === "skipped") {
      skippedByReason[result.reason] += 1;
      excludedFiles.push({
        path: result.path,
        reason: result.reason,
      });
      continue;
    }

    errors.push({
      path: result.path,
      error: result.error,
    });
  }

  const modelCosts = Object.entries(MODEL_PRICING_USD_PER_1M).map(
    ([modelId, rates]) => {
      const inputUsd = Number(
        ((totalTokens / 1_000_000) * rates.inputPer1MUsd).toFixed(8),
      );
      const outputUsd = Number(
        ((totalTokens / 1_000_000) * rates.outputPer1MUsd).toFixed(8),
      );
      return {
        model: modelId as ModelPriceId,
        inputUsd,
        outputUsd,
        notes: rates.notes,
      };
    },
  );

  return {
    processedFiles,
    totalTokens,
    costModel: model,
    estimatedInputCostUsd: estimateInputCostUsd(totalTokens, model),
    modelCosts,
    skippedCount: excludedFiles.length,
    skippedByReason,
    excludedFiles,
    errorCount: errors.length,
    errors,
  };
}
