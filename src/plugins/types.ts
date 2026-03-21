import type { ClassifiedContent, Post, SiteConfig } from "../config/types.js";

/**
 * Plugin system for rsslobster.
 *
 * A plugin is a JS/TS module that exports an `activate` function.
 * It receives a PluginAPI to register hooks and inject content.
 *
 * Design principles:
 * - Plugins cannot break the core pipeline (errors are caught + logged)
 * - Plugins compose — multiple plugins can inject into the same slots
 * - Zero plugins loaded = zero overhead (no plugin code runs)
 */

/** Context passed to every hook callback */
export interface HookContext {
  siteDir: string;
  config: SiteConfig;
}

/** Data for afterClassify hook */
export interface ClassifyHookData {
  content: ClassifiedContent;
}

/** Data for afterPublish hook */
export interface PublishHookData {
  post: Post;
}

/** Data for afterDeploy hook */
export interface DeployHookData {
  post: Post;
  committed: boolean;
  pushError?: string;
}

/** HTML injections a plugin can contribute to rendered pages */
export interface PageInjections {
  /** Extra HTML for <head> (e.g. OG tags, analytics, Disqus config) */
  head?: string;
  /** HTML injected at end of <article> (e.g. comments widget) */
  articleFooter?: string;
  /** HTML injected before </body> (e.g. scripts) */
  bodyEnd?: string;
}

/** Filter which pages receive injections */
export interface InjectionFilter {
  /** Only inject on these content types */
  types?: string[];
  /** Only inject on post pages (not index/archive) */
  postPagesOnly?: boolean;
}

/** The API exposed to plugins during activation */
export interface PluginAPI {
  /** Register a function that injects HTML into generated pages */
  injectHTML(
    fn: (content: ClassifiedContent | null, config: SiteConfig) => PageInjections,
    filter?: InjectionFilter,
  ): void;

  /** Register a lifecycle hook */
  on(event: "afterClassify", fn: (data: ClassifyHookData, ctx: HookContext) => void | Promise<void>): void;
  on(event: "afterPublish", fn: (data: PublishHookData, ctx: HookContext) => void | Promise<void>): void;
  on(event: "afterDeploy", fn: (data: DeployHookData, ctx: HookContext) => void | Promise<void>): void;
}

/** A plugin module must export an activate function */
export interface PluginModule {
  activate(api: PluginAPI, options?: Record<string, unknown>): void | Promise<void>;
}

// Plugin config is defined as PluginConfigEntry in config/types.ts
// Re-export for convenience
export type { PluginConfigEntry as PluginConfig } from "../config/types.js";
