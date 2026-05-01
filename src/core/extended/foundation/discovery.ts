import { globby } from "globby";
import { getEffectiveIgnoreGlobs } from "../../ignore-config.js";
import { DISCOVERY_PATTERNS } from "./constants.js";

export async function discoverFiles(cwd: string): Promise<string[]> {
  const ignoreGlobs = await getEffectiveIgnoreGlobs(cwd);
  const paths = await globby(DISCOVERY_PATTERNS, {
    cwd,
    expandDirectories: true,
    gitignore: true,
    ignore: ignoreGlobs,
    dot: true,
    onlyFiles: true,
  });

  return paths.sort((left, right) => left.localeCompare(right));
}
