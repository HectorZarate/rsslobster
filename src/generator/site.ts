import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { outputDir } from "../config/paths.js";
export { outputDir } from "../config/paths.js";
import type {
  ClassifiedContent,
  FeedConfig,
  FeedItem,
  Post,
  SiteConfig,
} from "../config/types.js";
import { generateHtmlPage, generateIndexPage, generateArchivePage } from "./html.js";
import { initMarkdown, renderMarkdown } from "./markdown.js";
import { generateRss } from "./rss.js";
import { generateJsonFeed } from "./json-feed.js";
import { writeSearchIndex } from "./search.js";
import { writeSeo } from "./seo.js";
import { writePages } from "../pages/pages.js";
import { expandPermalink, permalinkDir, DEFAULT_PERMALINK } from "../config/permalink.js";
import type { PageInjections } from "../plugins/types.js";
import { loadCustomCss } from "../styles/presets.js";
import { writeFavicon } from "./favicon.js";

const POSTS_INDEX = "posts.json";

/**
 * Site-level operations: add content, rebuild feeds, read config.
 */

/** Read site config from rsslobster.json */
export async function readSiteConfig(siteDir: string): Promise<SiteConfig> {
  const raw = await readFile(join(siteDir, "rsslobster.json"), "utf-8");
  return JSON.parse(raw) as SiteConfig;
}

/** Write site config */
export async function writeSiteConfig(
  siteDir: string,
  config: SiteConfig,
): Promise<void> {
  await writeFile(
    join(siteDir, "rsslobster.json"),
    JSON.stringify(config, null, 2),
  );
}

/** Read the posts index */
export async function readPostsIndex(siteDir: string): Promise<Post[]> {
  try {
    const raw = await readFile(join(siteDir, POSTS_INDEX), "utf-8");
    return JSON.parse(raw) as Post[];
  } catch {
    return [];
  }
}

/** Write the posts index */
async function writePostsIndex(
  siteDir: string,
  posts: Post[],
): Promise<void> {
  await writeFile(join(siteDir, POSTS_INDEX), JSON.stringify(posts, null, 2));
}

/** Optional injections from plugin system */
export interface AddContentOptions {
  pluginInjections?: PageInjections;
}

/** Add content to the site: generate HTML, update feeds, update index */
export async function addContent(
  siteDir: string,
  content: ClassifiedContent,
  options?: AddContentOptions,
): Promise<Post> {
  await initMarkdown();
  const config = await readSiteConfig(siteDir);

  // Load custom CSS if configured and fold into style overrides
  if (config.style.cssFile) {
    const customCss = await loadCustomCss(siteDir, config.style.cssFile);
    if (customCss) {
      config.style.overrides = config.style.overrides ?? {};
      config.style.overrides.customCss =
        (config.style.overrides.customCss ?? "") + "\n" + customCss;
    }
  }

  const posts = await readPostsIndex(siteDir);

  // Resolve slug collisions — append -2, -3, etc. if slug already exists
  const existingSlugs = new Set(posts.map((p) => p.slug));
  let slug = content.slug;
  let counter = 1;
  while (existingSlugs.has(slug)) {
    slug = `${content.slug}-${++counter}`;
  }
  if (slug !== content.slug) {
    content = { ...content, slug };
  }

  // Resolve permalink path
  const permalink = expandPermalink(config.permalink, content);
  const dir = permalinkDir(permalink);
  const outDir = outputDir(siteDir);
  if (dir) {
    await mkdir(join(outDir, dir), { recursive: true });
  }

  // Generate HTML page with OG, JSON-LD, and plugin injections
  const pageUrl = `https://${config.domain}${permalink}`;
  const html = generateHtmlPage(content, config, {
    pluginInjections: options?.pluginInjections,
    pageUrl,
  });

  // Write to the permalink path (strip leading /)
  const htmlPath = permalink.startsWith("/") ? permalink.slice(1) : permalink;
  await writeFile(join(outDir, htmlPath), html);

  // Create post record
  const post: Post = {
    ...content,
    url: pageUrl,
    publishedAt: new Date().toISOString(),
  };

  // Prepend to posts (newest first)
  posts.unshift(post);
  await writePostsIndex(siteDir, posts);

  // Rebuild feeds, index, search, SEO, and pages
  await rebuildFeeds(siteDir, config, posts);
  await rebuildIndex(siteDir, config, posts, options?.pluginInjections);
  await writeSearchIndex(siteDir, posts);
  await writeSeo(siteDir, config, posts);
  await writePages(siteDir, config, options?.pluginInjections);

  return post;
}

/** Rebuild RSS and JSON feeds from the posts index */
export async function rebuildFeeds(
  siteDir: string,
  config: SiteConfig,
  posts: Post[],
): Promise<void> {
  const feedConfig: FeedConfig = {
    title: config.title,
    link: `https://${config.domain}`,
    description: config.description,
    language: config.language,
    author: config.author,
    feedUrl: `https://${config.domain}/feed.xml`,
  };

  const items: FeedItem[] = posts.slice(0, 20).map((p) => ({
    title: p.title ?? truncate(p.body, 80),
    link: p.url,
    description: renderMarkdown(p.body),
    pubDate: new Date(p.publishedAt).toUTCString(),
    guid: p.url,
    author: config.author,
    categories: p.tags.length > 0 ? p.tags : undefined,
    enclosure: p.media?.[0]
      ? {
          url: `https://${config.domain}${p.media[0].src}`,
          type: p.media[0].mimeType,
        }
      : p.images?.[0]
        ? {
            url: `https://${config.domain}${p.images[0].src}`,
            type: mimeFromSrc(p.images[0].src),
          }
        : undefined,
  }));

  const rss = generateRss(feedConfig, items);
  const json = generateJsonFeed(feedConfig, items);

  await writeFile(join(outputDir(siteDir), "feed.xml"), rss);
  await writeFile(join(outputDir(siteDir), "feed.json"), json);
}

/** Rebuild the index.html and archive.html pages */
export async function rebuildIndex(
  siteDir: string,
  config: SiteConfig,
  posts: Post[],
  injections?: PageInjections,
): Promise<void> {
  const outDir = outputDir(siteDir);
  const html = generateIndexPage(posts, config, injections);
  await writeFile(join(outDir, "index.html"), html);

  // Generate archive page if there are enough posts
  if (posts.length > 30) {
    const archive = generateArchivePage(posts, config, injections);
    await writeFile(join(outDir, "archive.html"), archive);
  }
}

/** Scaffold a new site directory */
export async function scaffoldSite(
  siteDir: string,
  config: SiteConfig,
): Promise<void> {
  await mkdir(siteDir, { recursive: true });
  const outDir = outputDir(siteDir);
  await mkdir(outDir, { recursive: true });
  await mkdir(join(outDir, "images"), { recursive: true });
  await mkdir(join(outDir, "media"), { recursive: true });
  await mkdir(join(siteDir, "drafts"), { recursive: true });

  // Lock permalink pattern in config so future rsslobster upgrades don't break URLs
  if (!config.permalink) {
    config = { ...config, permalink: DEFAULT_PERMALINK };
  }

  await writeSiteConfig(siteDir, config);
  await writePostsIndex(siteDir, []);

  // Generate favicon
  await writeFavicon(siteDir, config.title, config.style.preset, config.style.overrides);

  // Generate empty index, feeds, search, SEO, and pages
  await rebuildFeeds(siteDir, config, []);
  await rebuildIndex(siteDir, config, []);
  await writeSearchIndex(siteDir, []);
  await writeSeo(siteDir, config, []);
  await writePages(siteDir, config);
}

function truncate(s: string, len: number): string {
  if (s.length <= len) return s;
  return s.slice(0, len - 1) + "\u2026";
}

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function mimeFromSrc(src: string): string {
  const ext = src.slice(src.lastIndexOf(".")).toLowerCase();
  return MIME_MAP[ext] ?? "image/jpeg";
}
