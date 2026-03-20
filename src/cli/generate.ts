import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { addContent } from "../generator/site.js";
import type { ClassifiedContent } from "../config/types.js";

export const generateCommand = new Command("generate")
  .description("Generate HTML + feeds from classified content (JSON on stdin)")
  .argument("[site-dir]", "Path to site directory", ".")
  .action(async (siteDir: string) => {
    const input = await readFile("/dev/stdin", "utf-8");
    const content = JSON.parse(input) as ClassifiedContent;

    const post = await addContent(siteDir, content);
    console.log(JSON.stringify({ ok: true, url: post.url, slug: post.slug }));
  });
