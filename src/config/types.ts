/** Content types supported by RSS Lobster */
export type ContentType = "micro" | "post" | "image" | "carousel" | "link" | "video" | "audio";

/** Draft status lifecycle */
export type DraftStatus = "draft" | "scheduled" | "published";

/** Site-level configuration stored in site repo root as rsslobster.json */
export interface SiteConfig {
  domain: string;
  title: string;
  description: string;
  author: string;
  language: string;
  style: StyleConfig;
  repo: string;
  /** Permalink pattern for post URLs. Default: "/:slug.html" */
  permalink?: string;
  /** Static pages (About, Contact, etc.) */
  pages?: PageConfig[];
  /** Plugins to load */
  plugins?: PluginConfigEntry[];
}

/** A static page — not part of the chronological feed */
export interface PageConfig {
  /** Page title */
  title: string;
  /** URL slug — becomes /{slug}.html */
  slug: string;
  /** Page body (plain text or HTML) */
  body: string;
  /** Nav order (lower = first). Omit to hide from nav. */
  navOrder?: number;
}

/** Plugin entry in site config */
export interface PluginConfigEntry {
  /** Module path (relative to site dir) or package name */
  name: string;
  /** Plugin-specific options */
  options?: Record<string, unknown>;
}

/** Style configuration — either a preset or inherited from a URL */
export interface StyleConfig {
  /** Use a built-in preset: "minimal", "brutalist", "magazine", "terminal" */
  preset?: StylePreset;
  /** Inherit styles from an existing site URL */
  inheritFrom?: string;
  /** Custom overrides applied on top of preset or inherited styles */
  overrides?: StyleOverrides;
  /** Path to a custom CSS file (relative to site dir). Appended after preset CSS. */
  cssFile?: string;
}

export type StylePreset = "minimal" | "brutalist" | "magazine" | "terminal";

export interface StyleOverrides {
  fontFamily?: string;
  fontFamilyHeading?: string;
  fontSize?: string;
  lineHeight?: string;
  maxWidth?: string;
  colorText?: string;
  colorBackground?: string;
  colorAccent?: string;
  colorLink?: string;
  colorVisited?: string;
  colorMuted?: string;
  colorBorder?: string;
  borderRadius?: string;
  customCss?: string;
}

/** Classified content ready for generation */
export interface ClassifiedContent {
  type: ContentType;
  title?: string;
  body: string;
  slug: string;
  tags: string[];
  images?: ImageAttachment[];
  /** Video or audio attachments */
  media?: MediaAttachment[];
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaAttachment {
  src: string;
  /** MIME type, e.g. "video/mp4", "audio/ogg" */
  mimeType: string;
  /** Duration in seconds, if known */
  duration?: number;
}

export interface ImageAttachment {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

/** A snapshot of draft content at a point in time */
export interface DraftRevision {
  /** Revision number (1-indexed, auto-incremented) */
  revision: number;
  /** ISO timestamp when this revision was saved */
  savedAt: string;
  /** Content snapshot */
  title?: string;
  body: string;
  tags: string[];
}

/** A draft extends classified content with status, scheduling, and optional preview */
export interface Draft extends ClassifiedContent {
  status: DraftStatus;
  scheduledAt?: string;
  /** Hex token for active preview (12-char, crypto-random) */
  previewId?: string;
  /** Full preview URL on the site domain */
  previewUrl?: string;
  /** ISO timestamp when the preview expires */
  previewExpiresAt?: string;
  /** Revision history — most recent last. First revision created on draft creation. */
  revisions?: DraftRevision[];
}

/** A published post, written to the posts index */
export interface Post extends ClassifiedContent {
  url: string;
  publishedAt: string;
}

/** RSS feed item */
export interface FeedItem {
  title?: string;
  link: string;
  description: string;
  pubDate: string;
  guid: string;
  author?: string;
  categories?: string[];
  enclosure?: {
    url: string;
    type: string;
    length?: number;
  };
}

/** How to handle new feed items */
export type FeedItemMode = "notify" | "draft" | "publish";

/** Configuration for the RSS reader / feed polling */
export interface ReaderConfig {
  /** Default mode for new feed items. Default: "notify" */
  defaultMode?: FeedItemMode;
  /** Default poll interval in minutes. Default: 15 */
  defaultInterval?: number;
}

/** RSS feed configuration */
export interface FeedConfig {
  title: string;
  link: string;
  description: string;
  language: string;
  author?: string;
  feedUrl: string;
  imageUrl?: string;
}
