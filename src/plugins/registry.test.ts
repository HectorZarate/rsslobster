import { describe, it, expect } from "vitest";
import { PluginRegistry } from "./registry.js";
import type { SiteConfig, ClassifiedContent } from "../config/types.js";

const CONFIG: SiteConfig = {
  domain: "example.com",
  title: "Test",
  description: "Test",
  author: "Test",
  language: "en",
  style: { preset: "minimal" },
  repo: "",
};

const CONTENT: ClassifiedContent = {
  type: "post",
  title: "Test Post",
  body: "Test body",
  slug: "test-post",
  tags: ["test"],
  createdAt: "2026-03-20T10:00:00Z",
  updatedAt: "2026-03-20T10:00:00Z",
};

describe("PluginRegistry", () => {
  it("returns empty injections with no plugins", () => {
    const registry = new PluginRegistry();
    const injections = registry.getInjections(CONTENT, CONFIG, "post");
    expect(injections).toEqual({});
  });

  it("collects injections from loaded plugins via API", async () => {
    const registry = new PluginRegistry();

    // Manually simulate a plugin activation
    const api = (registry as any).createAPI();
    api.injectHTML(() => ({
      head: '<meta name="test" content="value">',
      articleFooter: "<div>Comments here</div>",
      bodyEnd: "<script>analytics()</script>",
    }));

    const injections = registry.getInjections(CONTENT, CONFIG, "post");
    expect(injections.head).toContain('name="test"');
    expect(injections.articleFooter).toContain("Comments here");
    expect(injections.bodyEnd).toContain("analytics()");
  });

  it("filters by postPagesOnly", async () => {
    const registry = new PluginRegistry();
    const api = (registry as any).createAPI();

    api.injectHTML(
      () => ({ head: "<meta>", articleFooter: "footer" }),
      { postPagesOnly: true },
    );

    // Should inject on post pages
    const postInjections = registry.getInjections(CONTENT, CONFIG, "post");
    expect(postInjections.head).toContain("<meta>");

    // Should NOT inject on index pages
    const indexInjections = registry.getInjections(CONTENT, CONFIG, "index");
    expect(indexInjections.head).toBeUndefined();
  });

  it("filters by content type", async () => {
    const registry = new PluginRegistry();
    const api = (registry as any).createAPI();

    api.injectHTML(
      () => ({ head: "<meta>" }),
      { types: ["image", "video"] },
    );

    // post type should not match
    const postInjections = registry.getInjections(CONTENT, CONFIG, "post");
    expect(postInjections.head).toBeUndefined();

    // image type should match
    const imageContent = { ...CONTENT, type: "image" as const };
    const imageInjections = registry.getInjections(imageContent, CONFIG, "post");
    expect(imageInjections.head).toContain("<meta>");
  });

  it("merges injections from multiple plugins", () => {
    const registry = new PluginRegistry();
    const api = (registry as any).createAPI();

    api.injectHTML(() => ({ head: "<meta name='a'>" }));
    api.injectHTML(() => ({ head: "<meta name='b'>" }));

    const injections = registry.getInjections(CONTENT, CONFIG, "post");
    expect(injections.head).toContain("name='a'");
    expect(injections.head).toContain("name='b'");
  });

  it("handles plugin injection errors gracefully", () => {
    const registry = new PluginRegistry();
    const api = (registry as any).createAPI();

    api.injectHTML(() => {
      throw new Error("plugin crashed");
    });
    api.injectHTML(() => ({ head: "<meta name='ok'>" }));

    // Should not throw, and the second injection should still work
    const injections = registry.getInjections(CONTENT, CONFIG, "post");
    expect(injections.head).toContain("name='ok'");
  });

  it("fires plugin hooks", async () => {
    const registry = new PluginRegistry();
    const api = (registry as any).createAPI();

    let received: unknown = null;
    api.on("afterPublish", (data: unknown) => {
      received = data;
    });

    await registry.firePluginHooks(
      "afterPublish",
      { post: { ...CONTENT, url: "https://example.com/test.html", publishedAt: "2026-03-20T10:00:00Z" } },
      { siteDir: "/tmp", config: CONFIG },
    );

    expect(received).toBeDefined();
  });
});
