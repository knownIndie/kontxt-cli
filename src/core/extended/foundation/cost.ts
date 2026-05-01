import {
  DEFAULT_COST_MODEL,
  MODEL_PRICING_USD_PER_1M,
  type ModelPriceId,
} from "./pricing.js";

export function estimateInputCostUsd(
  tokenCount: number,
  model: ModelPriceId = DEFAULT_COST_MODEL,
): number {
  const rates = MODEL_PRICING_USD_PER_1M[model];
  const rawCost = (tokenCount / 1_000_000) * rates.inputPer1MUsd;
  return Number(rawCost.toFixed(8));
}
