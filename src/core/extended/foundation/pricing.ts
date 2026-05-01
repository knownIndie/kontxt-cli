export type ModelPriceId =
  | "openai/gpt-5.4"
  | "openai/gpt-5.4-mini"
  | "anthropic/claude-opus-4.6"
  | "anthropic/claude-sonnet-4.6"
  | "anthropic/claude-haiku-4.5"
  | "google/gemini-3.1-pro-preview"
  | "google/gemini-2.5-pro"
  | "google/gemini-2.5-flash";

export type ModelPrice = {
  inputPer1MUsd: number;
  outputPer1MUsd: number;
  notes?: string;
};

export const MODEL_PRICING_USD_PER_1M: Record<ModelPriceId, ModelPrice> = {
  "openai/gpt-5.4": {
    inputPer1MUsd: 2.5,
    outputPer1MUsd: 15,
  },
  "openai/gpt-5.4-mini": {
    inputPer1MUsd: 0.75,
    outputPer1MUsd: 4.5,
  },
  "anthropic/claude-opus-4.6": {
    inputPer1MUsd: 5,
    outputPer1MUsd: 25,
  },
  "anthropic/claude-sonnet-4.6": {
    inputPer1MUsd: 3,
    outputPer1MUsd: 15,
  },
  "anthropic/claude-haiku-4.5": {
    inputPer1MUsd: 1,
    outputPer1MUsd: 5,
  },
  "google/gemini-3.1-pro-preview": {
    inputPer1MUsd: 2,
    outputPer1MUsd: 12,
    notes: "Under 200k context window.",
  },
  "google/gemini-2.5-pro": {
    inputPer1MUsd: 1.25,
    outputPer1MUsd: 10,
    notes: "Under 200k context window.",
  },
  "google/gemini-2.5-flash": {
    inputPer1MUsd: 0.3,
    outputPer1MUsd: 2.5,
  },
};

export const DEFAULT_COST_MODEL: ModelPriceId = "openai/gpt-5.4";
