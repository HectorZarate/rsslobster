import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Post, SiteConfig } from "../config/types.js";
import { escXml } from "./rss.js";
import { outputDir } from "../config/paths.js";

/**
 * SEO output generators — sitemap.xml and robots.txt.
 *
 * Generated on every publish, same as feeds.
 * Sitemap includes all published posts + static pages.
 */

/** Generate sitemap.xml content */
export function generateSitemap(
  config: SiteConfig,
  posts: Post[],
): string {
  const base = `https://${config.domain}`;
  const now = new Date().toISOString().split("T")[0]!;

  const urls: string[] = [];

  // Index page
  urls.push(sitemapUrl(base + "/", now, "daily", "1.0"));

  // Static pages
  if (config.pages) {
    for (const page of config.pages) {
      urls.push(sitemapUrl(`${base}/${page.slug}.html`, now, "monthly", "0.8"));
    }
  }

  // Archive
  if (posts.length > 30) {
    urls.push(sitemapUrl(`${base}/archive.html`, now, "weekly", "0.5"));
  }

  // Posts (newest first, higher priority for recent)
  for (let i = 0; i < posts.length; i++) {
    const post = posts[i]!;
    const lastmod = post.updatedAt.split("T")[0]!;
    const priority = i < 10 ? "0.7" : "0.5";
    urls.push(sitemapUrl(post.url, lastmod, "monthly", priority));
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
}

function sitemapUrl(
  loc: string,
  lastmod: string,
  changefreq: string,
  priority: string,
): string {
  return `  <url>
    <loc>${escXml(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

/** Generate robots.txt content */
export function generateRobotsTxt(config: SiteConfig): string {
  const base = `https://${config.domain}`;
  return `User-agent: *
Allow: /
Disallow: /_previews/

Sitemap: ${base}/sitemap.xml
`;
}

/** Write sitemap.xml and robots.txt to site directory */
export async function writeSeo(
  siteDir: string,
  config: SiteConfig,
  posts: Post[],
): Promise<void> {
  const sitemap = generateSitemap(config, posts);
  const robots = generateRobotsTxt(config);

  await writeFile(join(outputDir(siteDir), "sitemap.xml"), sitemap);
  await writeFile(join(outputDir(siteDir), "robots.txt"), robots);
}

