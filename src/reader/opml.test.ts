import { describe, it, expect } from "vitest";
import { parseOpml, generateOpml } from "./opml.js";
import type { Subscription } from "./types.js";

// ---------------------------------------------------------------------------
// parseOpml
// ---------------------------------------------------------------------------

const FLAT_OPML = `<?xml version="1.0" encoding="utf-8"?>
<opml version="2.0">
  <head><title>My Feeds</title></head>
  <body>
    <outline type="rss" text="Example Blog" title="Example Blog"
             xmlUrl="https://example.com/feed.xml"
             htmlUrl="https://example.com"/>
    <outline type="rss" text="Another Feed" title="Another Feed"
             xmlUrl="https://another.com/rss"/>
  </body>
</opml>`;

const FOLDER_OPML = `<?xml version="1.0" encoding="utf-8"?>
<opml version="2.0">
  <head><title>Organized Feeds</title></head>
  <body>
    <outline text="Tech">
      <outline type="rss" text="Hacker News" title="Hacker News"
               xmlUrl="https://news.ycombinator.com/rss"
               htmlUrl="https://news.ycombinator.com"/>
      <outline type="rss" text="Lobsters" title="Lobsters"
               xmlUrl="https://lobste.rs/rss"/>
    </outline>
    <outline text="News">
      <outline type="rss" text="Reuters" title="Reuters"
               xmlUrl="https://reuters.com/feed"/>
    </outline>
    <outline type="rss" text="Unfiled Feed" title="Unfiled Feed"
             xmlUrl="https://unfiled.com/rss"/>
  </body>
</opml>`;

const MINIMAL_OPML = `<?xml version="1.0"?>
<opml version="2.0">
  <head><title>Minimal</title></head>
  <body>
    <outline type="rss" text="Just Text" xmlUrl="https://x.com/feed"/>
  </body>
</opml>`;

describe("parseOpml", () => {
  it("parses flat OPML with feed outlines", () => {
    const outlines = parseOpml(FLAT_OPML);

    expect(outlines).toHaveLength(2);
    expect(outlines[0]!.title).toBe("Example Blog");
    expect(outlines[0]!.xmlUrl).toBe("https://example.com/feed.xml");
    expect(outlines[0]!.htmlUrl).toBe("https://example.com");
    expect(outlines[0]!.folder).toBeUndefined();
  });

  it("parses folder-grouped OPML", () => {
    const outlines = parseOpml(FOLDER_OPML);

    expect(outlines).toHaveLength(4);

    const hn = outlines.find((o) => o.title === "Hacker News")!;
    expect(hn.folder).toBe("Tech");
    expect(hn.xmlUrl).toBe("https://news.ycombinator.com/rss");

    const reuters = outlines.find((o) => o.title === "Reuters")!;
    expect(reuters.folder).toBe("News");

    const unfiled = outlines.find((o) => o.title === "Unfiled Feed")!;
    expect(unfiled.folder).toBeUndefined();
  });

  it("uses text attribute as fallback when title is missing", () => {
    const outlines = parseOpml(MINIMAL_OPML);
    expect(outlines[0]!.title).toBe("Just Text");
  });

  it("throws on missing body tag", () => {
    expect(() => parseOpml("<opml><head></head></opml>")).toThrow(
      "missing <body>",
    );
  });

  it("returns empty array for empty body", () => {
    const outlines = parseOpml(`<opml><head></head><body></body></opml>`);
    expect(outlines).toEqual([]);
  });

  it("handles XML entities in attributes", () => {
    const xml = `<opml version="2.0">
      <head><title>T</title></head>
      <body>
        <outline type="rss" text="Feed &amp; More" title="Feed &amp; More"
                 xmlUrl="https://example.com/feed?a=1&amp;b=2"/>
      </body>
    </opml>`;

    const outlines = parseOpml(xml);
    expect(outlines[0]!.title).toBe("Feed & More");
    expect(outlines[0]!.xmlUrl).toBe("https://example.com/feed?a=1&b=2");
  });

  it("skips non-feed outlines without children", () => {
    const xml = `<opml version="2.0">
      <head><title>T</title></head>
      <body>
        <outline text="Not a feed" type="include"/>
        <outline type="rss" text="Real Feed" xmlUrl="https://x.com/f"/>
      </body>
    </opml>`;

    const outlines = parseOpml(xml);
    expect(outlines).toHaveLength(1);
    expect(outlines[0]!.title).toBe("Real Feed");
  });

  it("handles nested folders (assigns outermost matched folder)", () => {
    const xml = `<opml version="2.0">
      <head><title>T</title></head>
      <body>
        <outline text="Level1">
          <outline text="Level2">
            <outline type="rss" text="Deep Feed" xmlUrl="https://deep.com/f"/>
          </outline>
        </outline>
      </body>
    </opml>`;

    const outlines = parseOpml(xml);
    expect(outlines).toHaveLength(1);
    expect(outlines[0]!.title).toBe("Deep Feed");
    // Regex-based parser assigns the outermost folder
    expect(outlines[0]!.folder).toBe("Level1");
  });

  it("handles double-encoded entities in attributes", () => {
    const xml = `<opml version="2.0">
      <head><title>T</title></head>
      <body>
        <outline type="rss" text="AT&amp;T News" title="AT&amp;T News"
                 xmlUrl="https://att.com/feed"/>
      </body>
    </opml>`;
    const outlines = parseOpml(xml);
    expect(outlines[0]!.title).toBe("AT&T News");
  });
});

// ---------------------------------------------------------------------------
// generateOpml
// ---------------------------------------------------------------------------

function makeSub(overrides: Partial<Subscription>): Subscription {
  return {
    feedUrl: "https://example.com/feed.xml",
    title: "Example",
    addedAt: "2026-03-20T12:00:00.000Z",
    errorCount: 0,
    ...overrides,
  };
}

describe("generateOpml", () => {
  it("generates valid OPML 2.0 structure", () => {
    const xml = generateOpml("My Feeds", []);

    expect(xml).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(xml).toContain('<opml version="2.0">');
    expect(xml).toContain("<title>My Feeds</title>");
    expect(xml).toContain("</opml>");
  });

  it("renders unfiled subscriptions as flat outlines", () => {
    const subs = [
      makeSub({
        feedUrl: "https://a.com/feed",
        title: "Feed A",
        siteUrl: "https://a.com",
      }),
      makeSub({ feedUrl: "https://b.com/feed", title: "Feed B" }),
    ];

    const xml = generateOpml("Feeds", subs);
    expect(xml).toContain('xmlUrl="https://a.com/feed"');
    expect(xml).toContain('htmlUrl="https://a.com"');
    expect(xml).toContain('title="Feed B"');
  });

  it("groups subscriptions by folder", () => {
    const subs = [
      makeSub({
        feedUrl: "https://a.com/feed",
        title: "A",
        folder: "Tech",
      }),
      makeSub({
        feedUrl: "https://b.com/feed",
        title: "B",
        folder: "Tech",
      }),
      makeSub({ feedUrl: "https://c.com/feed", title: "C" }), // unfiled
    ];

    const xml = generateOpml("Feeds", subs);

    // Unfiled come first (no wrapper outline)
    expect(xml).toContain('title="C"');

    // Folder wrapper
    expect(xml).toContain('text="Tech"');
    expect(xml).toContain('title="A"');
    expect(xml).toContain('title="B"');
  });

  it("escapes special characters", () => {
    const subs = [
      makeSub({
        feedUrl: "https://example.com/feed?a=1&b=2",
        title: 'Feed "Quotes" & More',
      }),
    ];

    const xml = generateOpml("My <Feeds>", subs);
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&quot;");
    expect(xml).toContain("&lt;Feeds&gt;");
  });

  it("handles empty subscription list", () => {
    const xml = generateOpml("Empty", []);
    expect(xml).toContain("<body>");
    expect(xml).toContain("</body>");
    expect(xml).not.toContain("<outline");
  });

  it("roundtrips: generate then parse produces same feeds", () => {
    const subs = [
      makeSub({
        feedUrl: "https://a.com/feed",
        title: "Feed A",
        siteUrl: "https://a.com",
        folder: "Tech",
      }),
      makeSub({
        feedUrl: "https://b.com/feed",
        title: "Feed B",
      }),
    ];

    const xml = generateOpml("Test", subs);
    const parsed = parseOpml(xml);

    expect(parsed).toHaveLength(2);

    const feedB = parsed.find((o) => o.xmlUrl === "https://b.com/feed")!;
    expect(feedB.title).toBe("Feed B");
    expect(feedB.folder).toBeUndefined();

    const feedA = parsed.find((o) => o.xmlUrl === "https://a.com/feed")!;
    expect(feedA.title).toBe("Feed A");
    expect(feedA.htmlUrl).toBe("https://a.com");
    expect(feedA.folder).toBe("Tech");
  });
});
