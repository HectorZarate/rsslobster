import { describe, it, expect } from "vitest";
import { generateJsonFeed } from "./json-feed.js";
import type { FeedConfig, FeedItem } from "../config/types.js";

const FEED_CONFIG: FeedConfig = {
  title: "Test Feed",
  link: "https://example.com",
  description: "A test JSON feed",
  language: "en",
  author: "Test Author",
  feedUrl: "https://example.com/feed.xml",
};

const ITEMS: FeedItem[] = [
  {
    title: "First Post",
    link: "https://example.com/first.html",
    description: "<p>Hello world</p>",
    pubDate: new Date("2026-03-20T12:00:00Z").toUTCString(),
    guid: "https://example.com/first.html",
    author: "Test Author",
    categories: ["test"],
  },
];

describe("generateJsonFeed", () => {
  it("generates valid JSON Feed 1.1", () => {
    const output = generateJsonFeed(FEED_CONFIG, ITEMS);
    const feed = JSON.parse(output);

    expect(feed.version).toBe("https://jsonfeed.org/version/1.1");
    expect(feed.title).toBe("Test Feed");
    expect(feed.home_page_url).toBe("https://example.com");
    expect(feed.description).toBe("A test JSON feed");
    expect(feed.language).toBe("en");
  });

  it("uses feed.json URL for feed_url", () => {
    const output = generateJsonFeed(FEED_CONFIG, ITEMS);
    const feed = JSON.parse(output);
    expect(feed.feed_url).toBe("https://example.com/feed.json");
  });

  it("includes authors array", () => {
    const output = generateJsonFeed(FEED_CONFIG, ITEMS);
    const feed = JSON.parse(output);
    expect(feed.authors).toEqual([{ name: "Test Author" }]);
  });

  it("maps items correctly", () => {
    const output = generateJsonFeed(FEED_CONFIG, ITEMS);
    const feed = JSON.parse(output);

    expect(feed.items).toHaveLength(1);
    const item = feed.items[0];
    expect(item.id).toBe("https://example.com/first.html");
    expect(item.url).toBe("https://example.com/first.html");
    expect(item.title).toBe("First Post");
    expect(item.content_html).toBe("<p>Hello world</p>");
    expect(item.tags).toEqual(["test"]);
  });

  it("includes item authors", () => {
    const output = generateJsonFeed(FEED_CONFIG, ITEMS);
    const feed = JSON.parse(output);
    expect(feed.items[0].authors).toEqual([{ name: "Test Author" }]);
  });

  it("maps enclosures to attachments", () => {
    const items: FeedItem[] = [
      {
        ...ITEMS[0]!,
        enclosure: {
          url: "https://example.com/photo.jpg",
          type: "image/jpeg",
          length: 50000,
        },
      },
    ];
    const output = generateJsonFeed(FEED_CONFIG, items);
    const feed = JSON.parse(output);

    expect(feed.items[0].attachments).toEqual([
      {
        url: "https://example.com/photo.jpg",
        mime_type: "image/jpeg",
        size_in_bytes: 50000,
      },
    ]);
  });

  it("handles empty items", () => {
    const output = generateJsonFeed(FEED_CONFIG, []);
    const feed = JSON.parse(output);
    expect(feed.items).toEqual([]);
  });

  it("outputs valid JSON", () => {
    const output = generateJsonFeed(FEED_CONFIG, ITEMS);
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("omits title for items without a title", () => {
    const items: FeedItem[] = [{ ...ITEMS[0], title: undefined }];
    const json = JSON.parse(generateJsonFeed(FEED_CONFIG, items));
    expect(json.items[0].title).toBeUndefined();
    expect(json.items[0].content_html).toBeDefined();
  });
});
