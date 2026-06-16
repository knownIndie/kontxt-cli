export type ModelPriceId =
  | "openai/gpt-5.5"
  | "openai/gpt-5.5-pro"
  | "openai/gpt-5.4"
  | "openai/gpt-5.4-mini"
  | "openai/gpt-5-mini"
  | "anthropic/claude-opus-4.8"
  | "anthropic/claude-sonnet-4.6"
  | "anthropic/claude-haiku-4.5"
  | "google/gemini-3.1-pro-preview"
  | "google/gemini-3.1-flash-lite"
  | "google/gemini-2.5-pro"
  | "google/gemini-2.5-flash";

export type ModelPrice = {
  inputPer1MUsd: number;
  outputPer1MUsd: number;
  notes?: string;
};

export const MODEL_PRICING_USD_PER_1M: Record<ModelPriceId, ModelPrice> = {
  "openai/gpt-5.5": {
    inputPer1MUsd: 2.5,
    outputPer1MUsd: 15,
    notes: "Short context standard tier.",
  },
  "openai/gpt-5.5-pro": {
    inputPer1MUsd: 15,
    outputPer1MUsd: 90,
  },
  "openai/gpt-5.4": {
    inputPer1MUsd: 1.25,
    outputPer1MUsd: 7.5,
    notes: "Short context standard tier.",
  },
  "openai/gpt-5.4-mini": {
    inputPer1MUsd: 0.375,
    outputPer1MUsd: 2.25,
    notes: "Short context standard tier.",
  },
  "openai/gpt-5-mini": {
    inputPer1MUsd: 0.25,
    outputPer1MUsd: 2,
  },
  "anthropic/claude-opus-4.8": {
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
    notes: "Under 200k tokens; higher tier is $4/$18.",
  },
  "google/gemini-3.1-flash-lite": {
    inputPer1MUsd: 0.25,
    outputPer1MUsd: 1.5,
  },
  "google/gemini-2.5-pro": {
    inputPer1MUsd: 1.25,
    outputPer1MUsd: 10,
    notes: "Under 200k tokens.",
  },
  "google/gemini-2.5-flash": {
    inputPer1MUsd: 0.3,
    outputPer1MUsd: 2.5,
  },
};

export const DEFAULT_COST_MODEL: ModelPriceId = "openai/gpt-5.5";
