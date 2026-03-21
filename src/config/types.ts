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
}

/** Style configuration — either a preset or inherited from a URL */
export interface StyleConfig {
  /** Use a built-in preset: "minimal", "brutalist", "magazine", "terminal" */
  preset?: StylePreset;
  /** Inherit styles from an existing site URL */
  inheritFrom?: string;
  /** Custom overrides applied on top of preset or inherited styles */
  overrides?: StyleOverrides;
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
}

/** A published post, written to the posts index */
export interface Post extends ClassifiedContent {
  url: string;
  publishedAt: string;
}

/** RSS feed item */
export interface FeedItem {
  title: string;
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

/** RSS feed configuration */
export interface FeedConfig {
  title: string;
  link: string;
  description: string;
  language: string;
  author?: string;
  feedUrl: string;
}
