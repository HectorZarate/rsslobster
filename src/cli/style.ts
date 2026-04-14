import { Command } from "commander";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import pc from "picocolors";

const VALID_PRESETS = new Set(["minimal", "brutalist", "magazine", "terminal"]);

/** Change the style preset in rsslobster.json. */
export async function setStyle(siteDir: string, preset: string): Promise<void> {
  if (!VALID_PRESETS.has(preset)) {
    throw new Error(
      `Invalid style preset: "${preset}". Choose: ${[...VALID_PRESETS].join(", ")}`,
    );
  }

  const configPath = join(siteDir, "rsslobster.json");
  const raw = await readFile(configPath, "utf-8");
  const config = JSON.parse(raw) as Record<string, unknown>;

  const style = (config.style ?? {}) as Record<string, unknown>;
  style.preset = preset;
  config.style = style;

  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n");
}

export const styleCommand = new Command("style")
  .description("Change the site's style preset")
  .argument("<preset>", "Style preset: minimal, brutalist, magazine, terminal")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (preset: string, siteDirArg: string, opts: { siteDir: string }) => {
    const siteDir = resolve(opts.siteDir !== "." ? opts.siteDir : siteDirArg);
    try {
      await setStyle(siteDir, preset);
      console.log(pc.green(`Style changed to ${pc.cyan(preset)}.`));
      console.log(pc.dim("Run `rsslobster regenerate` to apply."));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to change style";
      console.error(pc.red(msg));
      process.exit(1);
    }
  });
