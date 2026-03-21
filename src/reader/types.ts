/** A feed subscription — metadata about a feed the user follows */
export interface Subscription {
  /** Canonical feed URL */
  feedUrl: string;
  /** Human-readable title (from feed or user override) */
  title: string;
  /** Site URL */
  siteUrl?: string;
  /** User-assigned folder/category */
  folder?: string;
  /** When this subscription was added */
  addedAt: string;
  /** Last successful fetch time */
  lastFetchedAt?: string;
  /** ETag from last fetch (for conditional GET) */
  etag?: string;
  /** Last-Modified header from last fetch */
  lastModified?: string;
  /** Consecutive fetch error count (0 = healthy) */
  errorCount: number;
  /** Last error message, if any */
  lastError?: string;
}

/** A parsed feed — the result of fetching and parsing a feed URL */
export interface ParsedFeed {
  format: "rss2" | "atom" | "rss1";
  title: string;
  link?: string;
  description?: string;
  language?: string;
  items: ParsedItem[];
  /** Feed-level ttl in minutes (RSS 2.0) */
  ttl?: number;
}

/** A single parsed item from a feed */
export interface ParsedItem {
  /** Unique ID: guid (RSS) or id (Atom) */
  id: string;
  title: string;
  link?: string;
  /** HTML or text content */
  content: string;
  /** Publication date as ISO string */
  publishedAt?: string;
  /** Update date as ISO string (Atom) */
  updatedAt?: string;
  author?: string;
  categories: string[];
}

/** Stored item with read/star state */
export interface StoredItem extends ParsedItem {
  /** Which subscription this came from */
  feedUrl: string;
  /** Dedup key: id > link > hash(title+content) */
  dedupKey: string;
  /** When this item was first seen */
  firstSeenAt: string;
  /** Read state */
  read: boolean;
  /** Starred/saved state */
  starred: boolean;
}

/** OPML outline element */
export interface OpmlOutline {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
  folder?: string;
}
