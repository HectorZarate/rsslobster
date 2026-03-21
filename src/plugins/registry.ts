import { resolve } from "node:path";
import type { ClassifiedContent, SiteConfig } from "../config/types.js";
import type {
  PluginAPI,
  PluginConfig,
  PageInjections,
  InjectionFilter,
  ClassifyHookData,
  PublishHookData,
  DeployHookData,
  HookContext,
} from "./types.js";

type HookFn = (data: unknown, ctx: HookContext) => void | Promise<void>;
type InjectionFn = (content: ClassifiedContent | null, config: SiteConfig) => PageInjections;

interface RegisteredInjection {
  fn: InjectionFn;
  filter?: InjectionFilter;
}

/**
 * Plugin registry — loads plugins and collects their contributions.
 *
 * All plugin errors are caught and logged. A misbehaving plugin
 * cannot crash the site build.
 */
export class PluginRegistry {
  private hooks = new Map<string, HookFn[]>();
  private injections: RegisteredInjection[] = [];

  /** Load and activate plugins from config */
  async loadPlugins(
    plugins: PluginConfig[],
    siteDir: string,
  ): Promise<void> {
    for (const pluginConfig of plugins) {
      try {
        const modulePath = pluginConfig.name.startsWith(".")
          ? resolve(siteDir, pluginConfig.name)
          : pluginConfig.name;

        const mod = (await import(modulePath)) as Record<string, unknown>;
        const activate = (typeof mod["activate"] === "function" ? mod["activate"] : undefined)
          ?? (typeof mod["default"] === "object" && mod["default"] !== null
            ? (mod["default"] as Record<string, unknown>)["activate"]
            : undefined);

        if (typeof activate !== "function") {
          console.error(`Plugin "${pluginConfig.name}": no activate function found`);
          continue;
        }

        const api = this.createAPI();
        await activate(api, pluginConfig.options);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Plugin "${pluginConfig.name}" failed to load: ${msg}`);
      }
    }
  }

  /** Get merged HTML injections for a page */
  getInjections(
    content: ClassifiedContent | null,
    config: SiteConfig,
    pageType: "post" | "index" | "archive",
  ): PageInjections {
    const merged: PageInjections = {};

    for (const { fn, filter } of this.injections) {
      // Apply filters
      if (filter?.postPagesOnly && pageType !== "post") continue;
      if (filter?.types && content && !filter.types.includes(content.type)) continue;

      try {
        const result = fn(content, config);
        if (result.head) merged.head = (merged.head ?? "") + "\n  " + result.head;
        if (result.articleFooter) {
          merged.articleFooter = (merged.articleFooter ?? "") + "\n      " + result.articleFooter;
        }
        if (result.bodyEnd) merged.bodyEnd = (merged.bodyEnd ?? "") + "\n" + result.bodyEnd;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Plugin injection error: ${msg}`);
      }
    }

    return merged;
  }

  /** Fire all registered hooks for an event */
  async firePluginHooks(
    event: string,
    data: ClassifyHookData | PublishHookData | DeployHookData,
    ctx: HookContext,
  ): Promise<void> {
    const fns = this.hooks.get(event);
    if (!fns) return;

    for (const fn of fns) {
      try {
        await fn(data, ctx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Plugin hook "${event}" error: ${msg}`);
      }
    }
  }

  createAPI(): PluginAPI {
    const injections = this.injections;
    const hooks = this.hooks;
    return {
      injectHTML: (fn, filter) => {
        injections.push({ fn, filter });
      },
      on: ((event: string, fn: (data: unknown, ctx: HookContext) => void | Promise<void>) => {
        const existing = hooks.get(event) ?? [];
        existing.push(fn as HookFn);
        hooks.set(event, existing);
      }) as PluginAPI["on"],
    };
  }
}
