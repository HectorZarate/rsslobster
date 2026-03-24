import type { FeedConfig, FeedItem } from "../config/types.js";
import { escHtml } from "./html.js";

/**
 * Generate RSS 2.0 XML from feed config and items.
 * Zero dependencies — hand-rolled XML generation.
 */
export function generateRss(config: FeedConfig, items: FeedItem[]): string {
  const itemsXml = items.map((item) => renderItem(item)).join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escXml(config.title)}</title>
    <link>${escXml(config.link)}</link>
    <description>${escXml(config.description)}</description>
    <language>${escXml(config.language)}</language>
    <atom:link href="${escXml(config.feedUrl)}" rel="self" type="application/rss+xml"/>
    <atom:link href="https://pubsubhubbub.appspot.com" rel="hub"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>${config.imageUrl ? `
    <image>
      <url>${escXml(config.imageUrl)}</url>
      <title>${escXml(config.title)}</title>
      <link>${escXml(config.link)}</link>
      <width>144</width>
      <height>144</height>
    </image>` : ""}
${itemsXml}
  </channel>
</rss>`;
}

function renderItem(item: FeedItem): string {
  const parts = [
    `    <item>`,
    `      <title>${escXml(item.title)}</title>`,
    `      <link>${escXml(item.link)}</link>`,
    `      <description>${escXml(item.description)}</description>`,
    `      <content:encoded><![CDATA[${item.description}]]></content:encoded>`,
    `      <pubDate>${item.pubDate}</pubDate>`,
    `      <guid isPermaLink="true">${escXml(item.guid)}</guid>`,
  ];

  if (item.author) {
    parts.push(`      <author>${escXml(item.author)}</author>`);
  }

  if (item.categories) {
    for (const cat of item.categories) {
      parts.push(`      <category>${escXml(cat)}</category>`);
    }
  }

  if (item.enclosure) {
    parts.push(
      `      <enclosure url="${escXml(item.enclosure.url)}" type="${escXml(item.enclosure.type)}"${item.enclosure.length ? ` length="${item.enclosure.length}"` : ""}/>`,
    );
  }

  parts.push(`    </item>`);
  return parts.join("\n");
}

export function escXml(s: string): string {
  return escHtml(s).replace(/'/g, "&apos;");
}
