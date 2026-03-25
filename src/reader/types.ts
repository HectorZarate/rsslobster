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
  /** Per-feed notification overrides */
  notify?: SubscriptionNotify;
}

/** Per-subscription notification preferences */
export interface SubscriptionNotify {
  /** Mute all notifications from this feed */
  muted?: boolean;
  /** Only notify for items matching ANY of these terms (case-insensitive, checked against title + content) */
  filter?: string[];
  /** High-priority feeds bypass quiet hours */
  priority?: "normal" | "high";
  /** Override global schedule for this feed */
  schedule?: NotificationSchedule;
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

/** Stored item with read/star/notification state */
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
  /** When notification was delivered (undefined = not yet notified) */
  notifiedAt?: string;
}

/** OPML outline element */
export interface OpmlOutline {
  title: string;
  xmlUrl: string;
  htmlUrl?: string;
  folder?: string;
}

// ---------------------------------------------------------------------------
// Notification system types
// ---------------------------------------------------------------------------

/** How often to deliver notifications */
export type NotificationSchedule = "immediate" | "hourly" | "daily" | "weekly";

/** Global notification configuration — stored in reader/config.json */
export interface NotificationConfig {
  /** Global on/off. Default: true */
  enabled: boolean;
  /** Delivery schedule. Default: "immediate" */
  schedule: NotificationSchedule;
  /** For daily/weekly: time of day to deliver (HH:MM). Default: "09:00" */
  deliverAt: string;
  /** For weekly: day of week (0=Sunday..6=Saturday). Default: 1 (Monday) */
  dayOfWeek: number;
  /** Quiet hours — no notifications during this window (high-priority feeds bypass) */
  quietHours?: {
    start: string; // "22:00"
    end: string;   // "08:00"
  };
  /** AI recap settings */
  recap: RecapConfig;
}

/** AI-generated recap configuration */
export interface RecapConfig {
  /** Generate AI recaps. Default: false */
  enabled: boolean;
  /** Recap frequency. Default: "daily" */
  frequency: "daily" | "weekly";
  /** Time to generate recap (HH:MM). Default: "08:00" */
  deliverAt: string;
  /** Recap style */
  style: "brief" | "detailed";
}

/** A pending notification waiting to be delivered */
export interface InboxEntry {
  /** Feed URL this item came from */
  feedUrl: string;
  /** Feed title at time of ingestion */
  feedTitle: string;
  /** Item dedup key (references stored item) */
  itemDedupKey: string;
  /** Item title */
  title: string;
  /** Item link */
  link?: string;
  /** First 300 chars of content (for notification preview) */
  summary: string;
  /** Item author */
  author?: string;
  /** When the item was ingested */
  receivedAt: string;
}

/** Feed metadata stored per-feed in reader/feeds/{slug}/meta.json */
export interface FeedMeta {
  /** Feed URL */
  feedUrl: string;
  /** Feed title (from feed XML, may differ from subscription title) */
  title: string;
  /** Site URL */
  siteUrl?: string;
  /** Feed description */
  description?: string;
  /** Feed language */
  language?: string;
  /** TTL from feed (minutes) */
  ttl?: number;
  /** Last poll timestamp */
  lastPolledAt?: string;
  /** Directory slug used on disk */
  slug: string;
}
