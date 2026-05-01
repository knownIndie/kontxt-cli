import { getEncoding } from "js-tiktoken";
import type { TokenType } from "../../types.js";

const encoder = getEncoding("cl100k_base");

export function countTokens(text: string): TokenType {
  return encoder.encode(text).length as TokenType;
}
