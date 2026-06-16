import { globby } from "globby";
import { getEffectiveIgnoreGlobs } from "../../ignore-config.js";
import { DISCOVERY_PATTERNS } from "./constants.js";

export async function discoverFiles(cwd: string): Promise<string[]> {
  return filterExistingFiles(cwd, DISCOVERY_PATTERNS);
}

export async function filterExistingFiles(
  cwd: string,
  patterns: string[],
): Promise<string[]> {
  const ignoreGlobs = await getEffectiveIgnoreGlobs(cwd);
  const paths = await globby(patterns, {
    cwd,
    expandDirectories: true,
    gitignore: true,
    ignore: ignoreGlobs,
    dot: true,
    onlyFiles: true,
  });

  return paths.sort((left, right) => left.localeCompare(right));
}
