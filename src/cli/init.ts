import { Command } from "commander";
import { readFile, appendFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import pc from "picocolors";
import { scaffoldSite } from "../generator/site.js";
import type { SiteConfig, StylePreset } from "../config/types.js";
import { ask, createPrompt } from "./prompt.js";
import { lobsterConfigExists, writeLobsterConfig } from "../config/lobster.js";

const VALID_PRESETS = new Set(["minimal", "brutalist", "magazine", "terminal"]);

/** Append lobster.json to .gitignore if not already listed. */
async function ensureGitignore(siteDir: string): Promise<void> {
  const gitignorePath = join(siteDir, ".gitignore");
  try {
    const existing = await readFile(gitignorePath, "utf-8");
    if (!existing.includes("lobster.json")) {
      await appendFile(gitignorePath, "\nlobster.json\n");
    }
  } catch {
    // File doesn't exist — create it
    await writeFile(gitignorePath, "lobster.json\nnode_modules/\n");
  }
}

/**
 * `init` is an alias for `onboard`. Both commands set up a new rsslobster site.
 * `onboard` is the canonical name; `init` is kept for backwards compatibility.
 */
export const initCommand = new Command("init")
  .description("Set up a new rsslobster site interactively (alias for onboard)")
  .argument("[site-dir]", "Path to create site in", ".")
  .option("--domain <domain>", "Domain (e.g. mysite.com)")
  .option("--title <title>", "Site title")
  .option("--author <author>", "Author name")
  .option("--description <desc>", "Site description")
  .option(
    "--style <preset>",
    "Style preset: minimal, brutalist, magazine, terminal",
  )
  .option("--force", "Re-scaffold even if site already exists")
  .action(
    async (
      siteDirArg: string,
      opts: {
        domain?: string;
        title?: string;
        author?: string;
        description?: string;
        style?: string;
        force?: boolean;
      },
    ) => {
      const siteDir = resolve(siteDirArg);

      // Existing project detection
      if (!opts.force && (await lobsterConfigExists(siteDir))) {
        console.error(
          pc.red(
            "Site already exists here. Use `rsslobster enable <feature>` to add capabilities, or pass `--force` to re-scaffold.",
          ),
        );
        process.exit(1);
      }

      // Non-interactive mode: all values via flags
      const isInteractive =
        !opts.domain && process.stdin.isTTY !== false;

      let domain: string;
      let title: string;
      let author: string;
      let description: string;
      let style: StylePreset = "minimal";

      if (isInteractive) {
        const rl = createPrompt();

        console.log(pc.bold("\nRSS Lobster — Setup\n"));

        domain = await ask(rl, "Domain (e.g. mysite.com)");
        if (!domain) {
          console.error(pc.red("Domain is required."));
          rl.close();
          process.exit(1);
        }

        title = await ask(rl, "Site title", domain);

        const styleInput = await ask(
          rl,
          "Style (minimal, brutalist, magazine, terminal)",
          "minimal",
        );
        if (VALID_PRESETS.has(styleInput)) {
          style = styleInput as StylePreset;
        }

        rl.close();
        author = "";
        description = "";
      } else {
        // Non-interactive: use flags
        domain = opts.domain ?? "";
        if (!domain) {
          console.error(pc.red("--domain is required."));
          process.exit(1);
        }
        title = opts.title ?? domain;
        author = opts.author ?? "";
        description = opts.description ?? "";
        if (opts.style && VALID_PRESETS.has(opts.style)) {
          style = opts.style as StylePreset;
        }
      }

      const siteConfig: SiteConfig = {
        domain,
        title,
        description: description || "A personal site",
        author,
        language: "en",
        style: { preset: style },
        repo: "",
      };

      // Scaffold site
      await scaffoldSite(siteDir, siteConfig);

      // Write minimal lobster.json (empty — enable commands add config)
      await writeLobsterConfig(siteDir, {});

      // Ensure lobster.json is in .gitignore
      await ensureGitignore(siteDir);

      console.log(pc.green("\n[OK] Site scaffolded."));
      console.log(`  Directory: ${pc.cyan(siteDir)}`);
      console.log(`  Style: ${pc.cyan(style)}`);
      console.log(
        `\nRun ${pc.bold("rsslobster dev")} to see your site at http://localhost:4321`,
      );
      console.log(pc.dim("\nNext steps:"));
      console.log(
        `  ${pc.cyan("rsslobster feed add <url>")}        Subscribe to a feed`,
      );
      console.log(
        `  ${pc.cyan("rsslobster enable telegram")}        Publish from your phone`,
      );
      console.log(
        `  ${pc.cyan("rsslobster enable model")}           AI-powered classification`,
      );
      console.log(
        `  ${pc.cyan("rsslobster enable deploy")}          Auto-deploy via git push\n`,
      );
    },
  );
