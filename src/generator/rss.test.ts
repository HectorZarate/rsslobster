import { describe, it, expect } from "vitest";
import { generateRss } from "./rss.js";
import type { FeedConfig, FeedItem } from "../config/types.js";

const FEED_CONFIG: FeedConfig = {
  title: "Test Feed",
  link: "https://example.com",
  description: "A test RSS feed",
  language: "en",
  author: "Test Author",
  feedUrl: "https://example.com/feed.xml",
};

const ITEMS: FeedItem[] = [
  {
    title: "First Post",
    link: "https://example.com/first-post.html",
    description: "Hello from rsslobster",
    pubDate: new Date("2026-03-20T12:00:00Z").toUTCString(),
    guid: "https://example.com/first-post.html",
    author: "Test Author",
    categories: ["test", "rss"],
  },
  {
    title: "Second Post with Image",
    link: "https://example.com/second-post.html",
    description: "A post with an image",
    pubDate: new Date("2026-03-20T13:00:00Z").toUTCString(),
    guid: "https://example.com/second-post.html",
    enclosure: {
      url: "https://example.com/images/photo.jpg",
      type: "image/jpeg",
      length: 102400,
    },
  },
];

describe("generateRss", () => {
  it("generates valid RSS 2.0 XML", () => {
    const rss = generateRss(FEED_CONFIG, ITEMS);
    expect(rss).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(rss).toContain('<rss version="2.0"');
    expect(rss).toContain("</rss>");
  });

  it("includes channel metadata", () => {
    const rss = generateRss(FEED_CONFIG, ITEMS);
    expect(rss).toContain("<title>Test Feed</title>");
    expect(rss).toContain("<link>https://example.com</link>");
    expect(rss).toContain("<description>A test RSS feed</description>");
    expect(rss).toContain("<language>en</language>");
  });

  it("includes atom:link self reference", () => {
    const rss = generateRss(FEED_CONFIG, ITEMS);
    expect(rss).toContain('xmlns:atom="http://www.w3.org/2005/Atom"');
    expect(rss).toContain(
      'href="https://example.com/feed.xml" rel="self"',
    );
  });

  it("renders items with all fields", () => {
    const rss = generateRss(FEED_CONFIG, ITEMS);
    expect(rss).toContain("<item>");
    expect(rss).toContain("<title>First Post</title>");
    expect(rss).toContain(
      "<link>https://example.com/first-post.html</link>",
    );
    expect(rss).toContain("<description>Hello from rsslobster</description>");
    expect(rss).toContain('<guid isPermaLink="true">');
    expect(rss).toContain("<author>Test Author</author>");
    expect(rss).toContain("<category>test</category>");
    expect(rss).toContain("<category>rss</category>");
  });

  it("renders enclosures for media", () => {
    const rss = generateRss(FEED_CONFIG, ITEMS);
    expect(rss).toContain(
      'url="https://example.com/images/photo.jpg"',
    );
    expect(rss).toContain('type="image/jpeg"');
    expect(rss).toContain('length="102400"');
  });

  it("generates valid XML with empty items", () => {
    const rss = generateRss(FEED_CONFIG, []);
    expect(rss).toContain("<channel>");
    expect(rss).toContain("</channel>");
    expect(rss).not.toContain("<item>");
  });

  it("omits title for items without a title", () => {
    const items = [{ ...ITEMS[0], title: undefined }];
    const rss = generateRss(FEED_CONFIG, items);
    expect(rss).toContain("<description>");
    const itemBlock = rss.match(/<item>[\s\S]*?<\/item>/)?.[0] ?? "";
    expect(itemBlock).not.toContain("<title>");
  });

  it("includes channel image when imageUrl is provided", () => {
    const config = { ...FEED_CONFIG, imageUrl: "https://example.com/icon.png" };
    const rss = generateRss(config, []);
    expect(rss).toContain("<image>");
    expect(rss).toContain("<url>https://example.com/icon.png</url>");
    expect(rss).toContain("</image>");
  });

  it("omits channel image when imageUrl is not provided", () => {
    const rss = generateRss(FEED_CONFIG, []);
    expect(rss).not.toContain("<image>");
  });

  // Security: escapes XML entities
  it("escapes special characters in content", () => {
    const items: FeedItem[] = [
      {
        title: 'Post with "quotes" & <tags>',
        link: "https://example.com/special.html",
        description: "Content with <b>bold</b> & ampersand",
        pubDate: new Date().toUTCString(),
        guid: "https://example.com/special.html",
      },
    ];
    const rss = generateRss(FEED_CONFIG, items);
    expect(rss).toContain("&amp;");
    expect(rss).toContain("&lt;");
    expect(rss).toContain("&gt;");
    expect(rss).not.toContain("<<"); // no double brackets
  });
});
