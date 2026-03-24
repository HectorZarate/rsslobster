import type { FeedConfig, FeedItem } from "../config/types.js";

/**
 * Generate JSON Feed 1.1 from feed config and items.
 * Spec: https://www.jsonfeed.org/version/1.1/
 */
export function generateJsonFeed(
  config: FeedConfig,
  items: FeedItem[],
): string {
  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: config.title,
    home_page_url: config.link,
    feed_url: config.feedUrl.replace(/feed\.xml$/, "feed.json"),
    description: config.description,
    language: config.language,
    icon: config.imageUrl,
    favicon: config.imageUrl,
    authors: config.author ? [{ name: config.author }] : undefined,
    items: items.map((item) => ({
      id: item.guid,
      url: item.link,
      title: item.title,
      content_html: item.description,
      date_published: new Date(item.pubDate).toISOString(),
      tags: item.categories,
      authors: item.author ? [{ name: item.author }] : undefined,
      attachments: item.enclosure
        ? [
            {
              url: item.enclosure.url,
              mime_type: item.enclosure.type,
              size_in_bytes: item.enclosure.length,
            },
          ]
        : undefined,
    })),
  };

  return JSON.stringify(feed, null, 2);
}
