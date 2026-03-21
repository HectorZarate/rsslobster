import { describe, it, expect } from "vitest";
import { parseFeed, decodeXml, generateId } from "./parser.js";

// ---------------------------------------------------------------------------
// RSS 2.0 parsing
// ---------------------------------------------------------------------------

const MINIMAL_RSS2 = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <description>A test feed</description>
    <language>en</language>
    <item>
      <title>First Post</title>
      <link>https://example.com/first</link>
      <description>Hello world</description>
      <guid>https://example.com/first</guid>
      <pubDate>Fri, 20 Mar 2026 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const FULL_RSS2 = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Full Feed</title>
    <link>https://example.com</link>
    <description>A fully featured feed</description>
    <language>en-us</language>
    <ttl>60</ttl>
    <item>
      <title>Rich Post</title>
      <link>https://example.com/rich</link>
      <description>Summary text</description>
      <content:encoded><![CDATA[<p>Full <strong>HTML</strong> content</p>]]></content:encoded>
      <guid isPermaLink="true">https://example.com/rich</guid>
      <pubDate>Thu, 19 Mar 2026 10:30:00 GMT</pubDate>
      <dc:creator>Jane Doe</dc:creator>
      <category>tech</category>
      <category>rss</category>
    </item>
    <item>
      <title>Minimal Item</title>
      <link>https://example.com/minimal</link>
      <description>Just basics</description>
      <guid>urn:uuid:12345</guid>
    </item>
  </channel>
</rss>`;

const RSS2_CDATA = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title><![CDATA[CDATA Title & "Quotes"]]></title>
    <link>https://example.com</link>
    <description><![CDATA[Description with <html> tags]]></description>
    <item>
      <title><![CDATA[Item with <special> chars & entities]]></title>
      <link>https://example.com/cdata</link>
      <description><![CDATA[<p>Paragraph</p>]]></description>
      <guid>https://example.com/cdata</guid>
    </item>
  </channel>
</rss>`;

const RSS2_ENTITIES = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Entity &amp; Test</title>
    <link>https://example.com</link>
    <description>Entities: &lt;b&gt; &amp; &quot;quotes&quot; &apos;apostrophes&apos;</description>
    <item>
      <title>Price: &#36;10 &#x2014; deal</title>
      <link>https://example.com/entities</link>
      <description>&#169; 2026</description>
      <guid>https://example.com/entities</guid>
    </item>
  </channel>
</rss>`;

describe("parseFeed — RSS 2.0", () => {
  it("parses minimal RSS 2.0 feed", () => {
    const feed = parseFeed(MINIMAL_RSS2);

    expect(feed.format).toBe("rss2");
    expect(feed.title).toBe("Test Feed");
    expect(feed.link).toBe("https://example.com");
    expect(feed.description).toBe("A test feed");
    expect(feed.language).toBe("en");
    expect(feed.items).toHaveLength(1);
  });

  it("parses RSS 2.0 item fields", () => {
    const feed = parseFeed(MINIMAL_RSS2);
    const item = feed.items[0]!;

    expect(item.id).toBe("https://example.com/first");
    expect(item.title).toBe("First Post");
    expect(item.link).toBe("https://example.com/first");
    expect(item.content).toBe("Hello world");
    expect(item.publishedAt).toBe("2026-03-20T12:00:00.000Z");
  });

  it("parses fully featured RSS 2.0 feed", () => {
    const feed = parseFeed(FULL_RSS2);

    expect(feed.title).toBe("Full Feed");
    expect(feed.language).toBe("en-us");
    expect(feed.ttl).toBe(60);
    expect(feed.items).toHaveLength(2);
  });

  it("prefers content:encoded over description", () => {
    const feed = parseFeed(FULL_RSS2);
    const item = feed.items[0]!;

    expect(item.content).toBe("<p>Full <strong>HTML</strong> content</p>");
  });

  it("parses dc:creator as author", () => {
    const feed = parseFeed(FULL_RSS2);
    expect(feed.items[0]!.author).toBe("Jane Doe");
  });

  it("parses multiple categories", () => {
    const feed = parseFeed(FULL_RSS2);
    expect(feed.items[0]!.categories).toEqual(["tech", "rss"]);
  });

  it("handles items without pubDate", () => {
    const feed = parseFeed(FULL_RSS2);
    expect(feed.items[1]!.publishedAt).toBeUndefined();
  });

  it("handles CDATA sections in titles and descriptions", () => {
    const feed = parseFeed(RSS2_CDATA);

    expect(feed.title).toBe('CDATA Title & "Quotes"');
    expect(feed.description).toBe("Description with <html> tags");
    expect(feed.items[0]!.title).toBe(
      "Item with <special> chars & entities",
    );
    expect(feed.items[0]!.content).toBe("<p>Paragraph</p>");
  });

  it("decodes XML entities", () => {
    const feed = parseFeed(RSS2_ENTITIES);

    expect(feed.title).toBe("Entity & Test");
    expect(feed.description).toContain("<b>");
    expect(feed.description).toContain('"quotes"');
    expect(feed.description).toContain("'apostrophes'");
  });

  it("decodes numeric and hex character references", () => {
    const feed = parseFeed(RSS2_ENTITIES);
    const item = feed.items[0]!;

    // &#36; = $, &#x2014; = em dash
    expect(item.title).toContain("$");
    expect(item.title).toContain("\u2014");
    // &#169; = copyright
    expect(item.content).toContain("\u00A9");
  });

  it("falls back to link as id when guid missing", () => {
    const xml = `<rss version="2.0"><channel><title>T</title>
      <item><title>No GUID</title><link>https://example.com/noguid</link>
      <description>test</description></item></channel></rss>`;
    const feed = parseFeed(xml);
    expect(feed.items[0]!.id).toBe("https://example.com/noguid");
  });

  it("generates content hash id when both guid and link missing", () => {
    const xml = `<rss version="2.0"><channel><title>T</title>
      <item><title>Orphan</title><description>no link no guid</description></item>
      </channel></rss>`;
    const feed = parseFeed(xml);
    expect(feed.items[0]!.id).toHaveLength(16);
    // Deterministic
    const feed2 = parseFeed(xml);
    expect(feed2.items[0]!.id).toBe(feed.items[0]!.id);
  });

  it("handles empty items array", () => {
    const xml = `<rss version="2.0"><channel><title>Empty</title>
      <link>https://example.com</link><description>No items</description>
      </channel></rss>`;
    const feed = parseFeed(xml);
    expect(feed.items).toHaveLength(0);
  });

  it("handles author tag (non-dc:creator)", () => {
    const xml = `<rss version="2.0"><channel><title>T</title>
      <item><title>A</title><link>https://x.com/a</link>
      <description>d</description><guid>1</guid>
      <author>bob@example.com</author></item></channel></rss>`;
    const feed = parseFeed(xml);
    expect(feed.items[0]!.author).toBe("bob@example.com");
  });
});

// ---------------------------------------------------------------------------
// Atom 1.0 parsing
// ---------------------------------------------------------------------------

const MINIMAL_ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <link href="https://example.com" rel="alternate"/>
  <subtitle>An atom feed</subtitle>
  <entry>
    <title>Atom Entry</title>
    <link href="https://example.com/atom-entry" rel="alternate"/>
    <id>urn:uuid:atom-1</id>
    <published>2026-03-20T12:00:00Z</published>
    <updated>2026-03-20T13:00:00Z</updated>
    <author><name>Alice</name></author>
    <summary>Short summary</summary>
    <content type="html">&lt;p&gt;Full content&lt;/p&gt;</content>
    <category term="atom"/>
    <category term="test"/>
  </entry>
</feed>`;

const ATOM_NO_CONTENT = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Summary Only</title>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>No Content Tag</title>
    <id>urn:uuid:no-content</id>
    <summary>This is the only text</summary>
  </entry>
</feed>`;

const ATOM_LINK_ORDER = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Link Order Test</title>
  <link rel="alternate" href="https://example.com/correct"/>
  <link rel="self" href="https://example.com/feed.atom"/>
  <entry>
    <title>Entry</title>
    <id>1</id>
    <link href="https://example.com/entry" rel="alternate"/>
    <content>test</content>
  </entry>
</feed>`;

describe("parseFeed — Atom 1.0", () => {
  it("parses minimal Atom feed", () => {
    const feed = parseFeed(MINIMAL_ATOM);

    expect(feed.format).toBe("atom");
    expect(feed.title).toBe("Atom Feed");
    expect(feed.link).toBe("https://example.com");
    expect(feed.description).toBe("An atom feed");
    expect(feed.items).toHaveLength(1);
  });

  it("parses Atom entry fields", () => {
    const feed = parseFeed(MINIMAL_ATOM);
    const entry = feed.items[0]!;

    expect(entry.id).toBe("urn:uuid:atom-1");
    expect(entry.title).toBe("Atom Entry");
    expect(entry.link).toBe("https://example.com/atom-entry");
    expect(entry.content).toBe("<p>Full content</p>");
    expect(entry.publishedAt).toBe("2026-03-20T12:00:00.000Z");
    expect(entry.updatedAt).toBe("2026-03-20T13:00:00.000Z");
    expect(entry.author).toBe("Alice");
    expect(entry.categories).toEqual(["atom", "test"]);
  });

  it("prefers content over summary", () => {
    const feed = parseFeed(MINIMAL_ATOM);
    expect(feed.items[0]!.content).toBe("<p>Full content</p>");
  });

  it("falls back to summary when no content tag", () => {
    const feed = parseFeed(ATOM_NO_CONTENT);
    expect(feed.items[0]!.content).toBe("This is the only text");
  });

  it("extracts alternate link, not self link", () => {
    const feed = parseFeed(ATOM_LINK_ORDER);
    expect(feed.link).toBe("https://example.com/correct");
  });

  it("extracts entry link correctly", () => {
    const feed = parseFeed(ATOM_LINK_ORDER);
    expect(feed.items[0]!.link).toBe("https://example.com/entry");
  });

  it("handles entries without published date", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <title>T</title>
      <entry><title>No Date</title><id>1</id><content>x</content></entry>
    </feed>`;
    const feed = parseFeed(xml);
    expect(feed.items[0]!.publishedAt).toBeUndefined();
  });

  it("extracts Atom categories from term attribute", () => {
    const feed = parseFeed(MINIMAL_ATOM);
    expect(feed.items[0]!.categories).toEqual(["atom", "test"]);
  });

  it("handles feed with no entries", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
      <title>Empty Atom</title>
      <link href="https://example.com" rel="alternate"/>
    </feed>`;
    const feed = parseFeed(xml);
    expect(feed.items).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// RSS 1.0 / RDF parsing
// ---------------------------------------------------------------------------

const MINIMAL_RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/"
         xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>RDF Feed</title>
    <link>https://example.com</link>
    <description>An RDF feed</description>
  </channel>
  <item>
    <title>RDF Item</title>
    <link>https://example.com/rdf-item</link>
    <description>RDF content</description>
    <dc:date>2026-03-20T12:00:00Z</dc:date>
    <dc:creator>Bob</dc:creator>
    <dc:subject>rdf</dc:subject>
  </item>
</rdf:RDF>`;

describe("parseFeed — RSS 1.0 / RDF", () => {
  it("parses RSS 1.0 feed", () => {
    const feed = parseFeed(MINIMAL_RDF);

    expect(feed.format).toBe("rss1");
    expect(feed.title).toBe("RDF Feed");
    expect(feed.link).toBe("https://example.com");
    expect(feed.items).toHaveLength(1);
  });

  it("parses RSS 1.0 item fields", () => {
    const feed = parseFeed(MINIMAL_RDF);
    const item = feed.items[0]!;

    expect(item.id).toBe("https://example.com/rdf-item");
    expect(item.title).toBe("RDF Item");
    expect(item.content).toBe("RDF content");
    expect(item.publishedAt).toBe("2026-03-20T12:00:00.000Z");
    expect(item.author).toBe("Bob");
    expect(item.categories).toEqual(["rdf"]);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("parseFeed — errors", () => {
  it("throws on unrecognized format", () => {
    expect(() => parseFeed("<html><body>Not a feed</body></html>")).toThrow(
      "Unrecognized feed format",
    );
  });

  it("throws on empty string", () => {
    expect(() => parseFeed("")).toThrow("Unrecognized feed format");
  });

  it("throws when RSS 2.0 has no channel", () => {
    expect(() => parseFeed("<rss version='2.0'></rss>")).toThrow(
      "missing <channel>",
    );
  });

  it("handles whitespace-padded XML", () => {
    const xml = `\n\n  <?xml version="1.0"?>\n<rss version="2.0">
      <channel><title>Padded</title><link>https://x.com</link>
      <description>d</description></channel></rss>\n\n`;
    const feed = parseFeed(xml);
    expect(feed.title).toBe("Padded");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("parseFeed — edge cases", () => {
  it("handles feeds with many items", () => {
    const items = Array.from(
      { length: 100 },
      (_, i) =>
        `<item><title>Post ${i}</title><link>https://x.com/${i}</link>
         <description>d</description><guid>${i}</guid></item>`,
    ).join("");
    const xml = `<rss version="2.0"><channel><title>Big</title>
      <link>https://x.com</link><description>d</description>
      ${items}</channel></rss>`;

    const feed = parseFeed(xml);
    expect(feed.items).toHaveLength(100);
    expect(feed.items[99]!.id).toBe("99");
  });

  it("handles items with empty title", () => {
    const xml = `<rss version="2.0"><channel><title>T</title>
      <item><title></title><link>https://x.com/a</link>
      <description>d</description><guid>1</guid></item></channel></rss>`;
    const feed = parseFeed(xml);
    expect(feed.items[0]!.title).toBe("");
  });

  it("handles mixed CDATA and entities in same feed", () => {
    const xml = `<rss version="2.0"><channel>
      <title><![CDATA[CDATA Title]]></title>
      <link>https://example.com</link>
      <description>Entity &amp; desc</description>
      <item>
        <title>Entity &lt;title&gt;</title>
        <link>https://example.com/1</link>
        <description><![CDATA[CDATA <b>desc</b>]]></description>
        <guid>1</guid>
      </item></channel></rss>`;
    const feed = parseFeed(xml);
    expect(feed.title).toBe("CDATA Title");
    expect(feed.description).toBe("Entity & desc");
    expect(feed.items[0]!.title).toBe("Entity <title>");
    expect(feed.items[0]!.content).toBe("CDATA <b>desc</b>");
  });

  it("uses description as content when content:encoded missing", () => {
    const feed = parseFeed(MINIMAL_RSS2);
    expect(feed.items[0]!.content).toBe("Hello world");
  });

  it("parses multiple items correctly without cross-contamination", () => {
    const feed = parseFeed(FULL_RSS2);
    expect(feed.items[0]!.id).toBe("https://example.com/rich");
    expect(feed.items[1]!.id).toBe("urn:uuid:12345");
    expect(feed.items[0]!.categories).toEqual(["tech", "rss"]);
    expect(feed.items[1]!.categories).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

describe("decodeXml", () => {
  it("decodes standard XML entities", () => {
    expect(decodeXml("&lt;b&gt;bold&lt;/b&gt;")).toBe("<b>bold</b>");
    expect(decodeXml("&amp;")).toBe("&");
    expect(decodeXml("&quot;hello&quot;")).toBe('"hello"');
    expect(decodeXml("&apos;hi&apos;")).toBe("'hi'");
  });

  it("decodes decimal character references", () => {
    expect(decodeXml("&#169;")).toBe("\u00A9"); // copyright
    expect(decodeXml("&#36;")).toBe("$");
  });

  it("decodes hex character references", () => {
    expect(decodeXml("&#x2014;")).toBe("\u2014"); // em dash
    expect(decodeXml("&#x26;")).toBe("&");
  });

  it("leaves plain text unchanged", () => {
    expect(decodeXml("Hello world")).toBe("Hello world");
  });

  it("handles multiple entities in sequence", () => {
    expect(decodeXml("A &amp; B &amp; C")).toBe("A & B & C");
  });
});

describe("generateId", () => {
  it("produces deterministic hash", () => {
    const id1 = generateId("title", "content");
    const id2 = generateId("title", "content");
    expect(id1).toBe(id2);
  });

  it("produces different hashes for different inputs", () => {
    const id1 = generateId("a", "b");
    const id2 = generateId("c", "d");
    expect(id1).not.toBe(id2);
  });

  it("returns 16 character hex string", () => {
    const id = generateId("test", "content");
    expect(id).toHaveLength(16);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });
});
