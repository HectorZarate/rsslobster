import { join } from "node:path";

/** Return the output directory for generated files within a site. */
export function outputDir(siteDir: string): string {
  return join(siteDir, "_site");
}
