import { Command } from "commander";
import { resolve } from "node:path";
import pc from "picocolors";
import { readSiteConfig, writeSiteConfig, readPostsIndex } from "../generator/site.js";
import { writePages } from "../pages/pages.js";
import type { PageConfig } from "../config/types.js";

export const pagesCommand = new Command("pages")
  .description("Manage static pages (About, Contact, etc.)")
  .argument("[site-dir]", "Path to site directory", ".")
  .option("--site-dir <dir>", "Path to site directory", ".");

pagesCommand
  .command("add")
  .description("Add a new static page")
  .requiredOption("--title <title>", "Page title")
  .requiredOption("--slug <slug>", "URL slug")
  .requiredOption("--body <body>", "Page content")
  .option("--nav-order <n>", "Navigation order (lower = first)")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (opts: {
    title: string;
    slug: string;
    body: string;
    navOrder?: string;
    siteDir: string;
  }) => {
    const siteDir = resolve(opts.siteDir);
    const config = await readSiteConfig(siteDir);

    // Validate slug (no path traversal, alphanumeric + hyphens only)
    if (!/^[a-z0-9][a-z0-9-]*$/.test(opts.slug)) {
      console.error(pc.red(`Invalid slug "${opts.slug}". Use only lowercase letters, numbers, and hyphens.`));
      process.exit(1);
    }

    const page: PageConfig = {
      title: opts.title,
      slug: opts.slug,
      body: opts.body,
      navOrder: opts.navOrder ? parseInt(opts.navOrder, 10) : undefined,
    };

    config.pages = config.pages ?? [];

    // Check for slug collision
    if (config.pages.some((p) => p.slug === page.slug)) {
      console.error(pc.red(`Page with slug "${page.slug}" already exists`));
      process.exit(1);
    }

    config.pages.push(page);
    await writeSiteConfig(siteDir, config);
    const posts = await readPostsIndex(siteDir);
    await writePages(siteDir, config, undefined, posts);

    console.log(pc.green(`Added page: ${page.title} → /${page.slug}.html`));
  });

pagesCommand
  .command("list")
  .description("List all static pages")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (opts: { siteDir: string }) => {
    const siteDir = resolve(opts.siteDir);
    const config = await readSiteConfig(siteDir);
    const pages = config.pages ?? [];

    if (pages.length === 0) {
      console.log("No pages configured.");
      return;
    }

    console.log(JSON.stringify(pages, null, 2));
  });

pagesCommand
  .command("remove")
  .description("Remove a static page by slug")
  .argument("<slug>", "Page slug to remove")
  .option("--site-dir <dir>", "Path to site directory", ".")
  .action(async (slug: string, opts: { siteDir: string }) => {
    const siteDir = resolve(opts.siteDir);
    const config = await readSiteConfig(siteDir);

    const before = config.pages?.length ?? 0;
    config.pages = (config.pages ?? []).filter((p) => p.slug !== slug);

    if (config.pages.length === before) {
      console.error(pc.red(`No page with slug "${slug}" found`));
      process.exit(1);
    }

    await writeSiteConfig(siteDir, config);
    console.log(pc.green(`Removed page: ${slug}`));
  });
