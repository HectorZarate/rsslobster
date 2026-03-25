import type { ParsedFeed, ParsedItem } from "./types.js";
import { contentHash } from "./paths.js";

/**
 * Parse RSS 2.0 or Atom XML into a normalized ParsedFeed.
 * Zero dependencies — hand-rolled XML extraction via regex.
 *
 * Supports:
 * - RSS 2.0 (channel/item)
 * - Atom 1.0 (feed/entry)
 * - RSS 1.0 / RDF (rdf:RDF/item)
 * - CDATA sections
 * - XML entity decoding
 * - Graceful fallbacks for missing fields
 */
export function parseFeed(xml: string): ParsedFeed {
  // Strip BOM and whitespace
  const trimmed = xml.replace(/^\uFEFF/, "").trim();

  if (/<feed[\s>]/i.test(trimmed)) {
    return parseAtom(trimmed);
  }
  if (/<rdf:RDF[\s>]/i.test(trimmed)) {
    return parseRss1(trimmed);
  }
  if (/<rss[\s>]/i.test(trimmed)) {
    return parseRss2(trimmed);
  }

  throw new Error("Unrecognized feed format: expected RSS 2.0, Atom, or RDF");
}

// ---------------------------------------------------------------------------
// RSS 2.0
// ---------------------------------------------------------------------------

function parseRss2(xml: string): ParsedFeed {
  const channel = extractBlock(xml, "channel");
  if (!channel) throw new Error("RSS 2.0: missing <channel>");

  // Extract items first, then remove them to get clean channel metadata
  const items = extractAllBlocks(channel, "item").map(parseRss2Item);
  const channelMeta = channel.replace(/<item[\s\S]*?<\/item>/gi, "");

  return {
    format: "rss2",
    title: extractText(channelMeta, "title") ?? "Untitled",
    link: extractText(channelMeta, "link"),
    description: extractText(channelMeta, "description"),
    language: extractText(channelMeta, "language"),
    items,
    ttl: parseTtl(extractText(channelMeta, "ttl")),
  };
}

function parseRss2Item(xml: string): ParsedItem {
  const title = extractText(xml, "title") ?? "";
  const link = extractText(xml, "link");
  const description = extractText(xml, "description") ?? "";
  const content =
    extractText(xml, "content:encoded") ?? description;
  const guid = extractText(xml, "guid");
  const pubDate = extractText(xml, "pubDate");
  const author =
    extractText(xml, "dc:creator") ?? extractText(xml, "author");
  const categories = extractAllText(xml, "category");

  const id = guid ?? link ?? generateId(title, content);

  return {
    id,
    title,
    link,
    content,
    publishedAt: pubDate ? parseDate(pubDate) : undefined,
    author,
    categories,
  };
}

// ---------------------------------------------------------------------------
// Atom 1.0
// ---------------------------------------------------------------------------

function parseAtom(xml: string): ParsedFeed {
  // Extract entries first, then remove them for clean feed metadata
  const entries = extractAllBlocks(xml, "entry").map(parseAtomEntry);
  const feedMeta = xml.replace(/<entry[\s\S]*?<\/entry>/gi, "");

  return {
    format: "atom",
    title: extractText(feedMeta, "title") ?? "Untitled",
    link: extractAtomLink(feedMeta, "alternate") ?? extractAtomHref(feedMeta),
    description: extractText(feedMeta, "subtitle"),
    language: extractAttr(feedMeta, "feed", "xml:lang"),
    items: entries,
  };
}

function parseAtomEntry(xml: string): ParsedItem {
  const title = extractText(xml, "title") ?? "";
  const link = extractAtomLink(xml, "alternate") ?? extractAtomHref(xml);
  const id = extractText(xml, "id") ?? link ?? generateId(title, "");

  // Content: prefer <content>, fall back to <summary>
  const content =
    extractText(xml, "content") ?? extractText(xml, "summary") ?? "";

  const published = extractText(xml, "published");
  const updated = extractText(xml, "updated");
  const authorName = extractText(
    extractBlock(xml, "author") ?? "",
    "name",
  );
  const categories = extractAtomCategories(xml);

  return {
    id,
    title,
    link,
    content,
    publishedAt: published ? parseDate(published) : undefined,
    updatedAt: updated ? parseDate(updated) : undefined,
    author: authorName,
    categories,
  };
}

// ---------------------------------------------------------------------------
// RSS 1.0 / RDF
// ---------------------------------------------------------------------------

function parseRss1(xml: string): ParsedFeed {
  const channel = extractBlock(xml, "channel");
  const items = extractAllBlocks(xml, "item").map(parseRss1Item);

  return {
    format: "rss1",
    title: extractText(channel ?? "", "title") ?? "Untitled",
    link: extractText(channel ?? "", "link"),
    description: extractText(channel ?? "", "description"),
    items,
  };
}

function parseRss1Item(xml: string): ParsedItem {
  const title = extractText(xml, "title") ?? "";
  const link = extractText(xml, "link");
  const description = extractText(xml, "description") ?? "";
  const date = extractText(xml, "dc:date");

  return {
    id: link ?? generateId(title, description),
    title,
    link,
    content: description,
    publishedAt: date ? parseDate(date) : undefined,
    author: extractText(xml, "dc:creator"),
    categories: extractAllText(xml, "dc:subject"),
  };
}

// ---------------------------------------------------------------------------
// XML extraction helpers (regex-based, handles CDATA)
// ---------------------------------------------------------------------------

/** Extract the inner content of the first matching tag */
function extractText(xml: string, tag: string): string | undefined {
  // Handle self-closing tags
  const selfClosing = new RegExp(`<${escapeRegex(tag)}\\s*/\\s*>`, "i");
  if (selfClosing.test(xml)) return "";

  // Match tag with optional attributes, capturing inner content (including CDATA)
  const re = new RegExp(
    `<${escapeRegex(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRegex(tag)}>`,
    "i",
  );
  const m = re.exec(xml);
  if (!m) return undefined;
  return decodeXml(stripCdata(m[1]!.trim()));
}

/** Extract all text values for a repeated tag */
function extractAllText(xml: string, tag: string): string[] {
  const re = new RegExp(
    `<${escapeRegex(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRegex(tag)}>`,
    "gi",
  );
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(decodeXml(stripCdata(m[1]!.trim())));
  }
  return results;
}

/** Extract the full inner block of the first matching tag */
function extractBlock(xml: string, tag: string): string | undefined {
  const re = new RegExp(
    `<${escapeRegex(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRegex(tag)}>`,
    "i",
  );
  const m = re.exec(xml);
  return m?.[1];
}

/** Extract all blocks for a repeated tag */
function extractAllBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(
    `<${escapeRegex(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escapeRegex(tag)}>`,
    "gi",
  );
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1]!);
  }
  return results;
}

/** Extract an attribute from a tag */
function extractAttr(
  xml: string,
  tag: string,
  attr: string,
): string | undefined {
  const re = new RegExp(
    `<${escapeRegex(tag)}\\s[^>]*${escapeRegex(attr)}\\s*=\\s*"([^"]*)"`,
    "i",
  );
  return re.exec(xml)?.[1];
}

/** Extract href from Atom <link> with optional rel */
function extractAtomLink(xml: string, rel: string): string | undefined {
  const re = new RegExp(
    `<link\\s[^>]*rel\\s*=\\s*"${escapeRegex(rel)}"[^>]*href\\s*=\\s*"([^"]*)"`,
    "i",
  );
  const m = re.exec(xml);
  if (m) return m[1];

  // Try reversed attribute order
  const re2 = new RegExp(
    `<link\\s[^>]*href\\s*=\\s*"([^"]*)"[^>]*rel\\s*=\\s*"${escapeRegex(rel)}"`,
    "i",
  );
  return re2.exec(xml)?.[1];
}

/** Extract href from first <link> tag (fallback when no rel specified) */
function extractAtomHref(xml: string): string | undefined {
  const re = /href\s*=\s*"([^"]*)"/i;
  const linkBlock = /<link\s[^>]*>/i.exec(xml);
  if (!linkBlock) return undefined;
  return re.exec(linkBlock[0])?.[1];
}

/** Extract Atom categories from <category term="..."/> */
function extractAtomCategories(xml: string): string[] {
  const re = /<category\s[^>]*term\s*=\s*"([^"]*)"/gi;
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1]!);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Strip CDATA wrapper if present */
function stripCdata(s: string): string {
  const m = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(s);
  return m ? m[1]! : s;
}

/** Decode XML entities. &amp; is decoded last to prevent double-decoding. */
export function decodeXml(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h as string, 16)),
    )
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Parse various date formats into ISO string */
function parseDate(s: string): string | undefined {
  const d = new Date(s);
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/** Parse TTL string to number */
function parseTtl(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = parseInt(s, 10);
  return isNaN(n) ? undefined : n;
}

/** Generate a content-addressable ID when guid/id is missing */
export function generateId(title: string, content: string): string {
  return contentHash(title, content);
}

/** Escape special regex characters */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
