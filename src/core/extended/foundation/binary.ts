import { open } from "node:fs/promises";
import { BINARY_SAMPLE_BYTES } from "./constants.js";

export async function readHeadBytes(
  absoluteFilePath: string,
  sampleBytes: number = BINARY_SAMPLE_BYTES,
): Promise<Buffer> {
  const fileHandle = await open(absoluteFilePath, "r");
  try {
    const buffer = Buffer.alloc(sampleBytes);
    const { bytesRead } = await fileHandle.read(buffer, 0, sampleBytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
}

export function isBinaryBuffer(buffer: Buffer): boolean {
  for (const byte of buffer) {
    if (byte === 0) {
      return true;
    }
  }
  return false;
}

export async function isBinaryFile(
  absoluteFilePath: string,
  sampleBytes: number = BINARY_SAMPLE_BYTES,
): Promise<boolean> {
  const sample = await readHeadBytes(absoluteFilePath, sampleBytes);
  return isBinaryBuffer(sample);
}
