import { Command } from "commander";
import { resolve } from "node:path";
import pc from "picocolors";
import type { ClassifiedContent, ContentType } from "../config/types.js";
import { VALID_TYPES, MAX_TAGS, slugify } from "../config/content.js";
import { addContent, readSiteConfig } from "../generator/site.js";
import { deployToGit } from "../deploy/git.js";
import { pingWebSubHub } from "../deploy/websub.js";
import { resolveTargetSite } from "../config/workspace.js";

export interface PublishOptions {
  type: ContentType;
  text: string;
  title?: string;
  slug?: string;
  tags?: string;
  linkUrl?: string;
}

/** Build ClassifiedContent from explicit CLI options — no LLM needed. */
export function buildPublishContent(opts: PublishOptions): ClassifiedContent {
  if (!opts.text || opts.text.trim().length === 0) {
    throw new Error("Text is required");
  }

  if (!VALID_TYPES.has(opts.type)) {
    throw new Error(
      `Invalid content type: "${opts.type}". Must be: ${[...VALID_TYPES].join(", ")}`,
    );
  }

  const tags = opts.tags
    ? opts.tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .slice(0, MAX_TAGS)
    : [];

  const slug = opts.slug ?? slugify(opts.title ?? opts.text);

  if (!slug) {
    throw new Error("Could not generate slug from content");
  }

  const now = new Date().toISOString();

  return {
    type: opts.type,
    title: opts.title,
    body: opts.text,
    slug,
    tags,
    linkUrl: opts.linkUrl,
    createdAt: now,
    updatedAt: now,
  };
}

export const publishCommand = new Command("publish")
  .description(
    "Publish content directly — no LLM, no Telegram. Just text to HTML.",
  )
  .argument("<text>", "The content to publish")
  .option(
    "--type <type>",
    "Content type: micro, post, image, carousel, link",
    "micro",
  )
  .option("--title <title>", "Post title (for post type)")
  .option("--slug <slug>", "Custom URL slug")
  .option("--tags <tags>", "Comma-separated tags (max 3)")
  .option("--link-url <url>", "URL for link-type posts")
  .option("--deploy", "Git commit and push after publication")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .option("--to <site>", "Publish to a different registered site")
  .action(
    async (
      text: string,
      opts: {
        type: string;
        title?: string;
        slug?: string;
        tags?: string;
        linkUrl?: string;
        deploy: boolean;
        siteDir: string;
        to?: string;
      },
    ) => {
      let siteDir = resolve(opts.siteDir);

      // Resolve target site from registry
      if (opts.to) {
        try {
          const resolved = await resolveTargetSite(opts.to);
          siteDir = resolved.siteDir;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to resolve target site";
          console.error(pc.red(msg));
          process.exit(1);
        }
      }

      let content: ClassifiedContent;
      try {
        content = buildPublishContent({
          type: opts.type as ContentType,
          text,
          title: opts.title,
          slug: opts.slug,
          tags: opts.tags,
          linkUrl: opts.linkUrl,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Invalid input";
        console.error(pc.red(msg));
        process.exit(1);
      }

      let post;
      try {
        post = await addContent(siteDir, content);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Generation failed";
        console.error(pc.red(`Failed to generate: ${msg}`));
        process.exit(1);
      }

      if (opts.deploy) {
        const result = await deployToGit(siteDir, `publish: ${content.type} — ${content.slug}`);
        if (result.committed && !result.pushError) {
          console.log(pc.green(`Published. ${post.url}`));
          // Ping WebSub hub for instant RSS reader updates
          const config = await readSiteConfig(siteDir);
          await pingWebSubHub(`https://${config.domain}/feed.xml`);
          await pingWebSubHub(`https://${config.domain}/feed.json`);
        } else if (result.committed) {
          console.log(pc.yellow(`Published locally. ${post.url}`));
        }
      } else {
        console.log(pc.green(`Published locally. ${post.url}`));
      }
    },
  );
