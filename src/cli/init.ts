import { Command } from "commander";
import { scaffoldSite } from "../generator/site.js";
import type { SiteConfig, StylePreset } from "../config/types.js";

export const initCommand = new Command("init")
  .description("Scaffold a new rsslobster site")
  .requiredOption("--domain <domain>", "Your domain (e.g. mysite.com)")
  .requiredOption("--title <title>", "Site title")
  .option("--description <desc>", "Site description", "")
  .option("--author <author>", "Author name", "")
  .option("--language <lang>", "Language code", "en")
  .option(
    "--style <preset>",
    "Style preset: minimal, brutalist, magazine, terminal",
    "minimal",
  )
  .option("--repo <repo>", "Git remote URL for deploy")
  .argument("[site-dir]", "Path to create site in", ".")
  .action(async (siteDir: string, opts: {
    domain: string;
    title: string;
    description: string;
    author: string;
    language: string;
    style: string;
    repo?: string;
  }) => {
    const config: SiteConfig = {
      domain: opts.domain,
      title: opts.title,
      description: opts.description,
      author: opts.author,
      language: opts.language,
      style: { preset: opts.style as StylePreset },
      repo: opts.repo ?? "",
    };

    await scaffoldSite(siteDir, config);
    console.log(JSON.stringify({ ok: true, siteDir, config }));
  });
