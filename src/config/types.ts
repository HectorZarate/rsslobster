/** Content types supported by RSS Lobster */
export type ContentType = "micro" | "post" | "image" | "carousel" | "link";

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
  fontSize?: string;
  lineHeight?: string;
  maxWidth?: string;
  colorText?: string;
  colorBackground?: string;
  colorAccent?: string;
  colorMuted?: string;
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
  linkUrl?: string;
  linkTitle?: string;
  linkDescription?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImageAttachment {
  src: string;
  alt: string;
  width?: number;
  height?: number;
}

/** A draft extends classified content with status and scheduling */
export interface Draft extends ClassifiedContent {
  status: DraftStatus;
  scheduledAt?: string;
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
