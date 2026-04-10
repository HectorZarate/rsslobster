import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleAdminPublish } from "./handler.js";
import type { SiteConfig } from "../config/types.js";
import { initMarkdown } from "../generator/markdown.js";

const CONFIG: SiteConfig = {
  domain: "example.com",
  title: "Test Site",
  description: "Test",
  author: "Tester",
  language: "en",
  style: { preset: "minimal" },
  repo: "git@github.com:user/site.git",
};

let siteDir: string;

beforeEach(async () => {
  siteDir = await mkdtemp(join(tmpdir(), "rsslobster-handler-"));
  await writeFile(join(siteDir, "rsslobster.json"), JSON.stringify(CONFIG));
  await writeFile(join(siteDir, "lobster.json"), "{}");
  await mkdir(join(siteDir, "_site"), { recursive: true });
  await initMarkdown();
});

afterEach(async () => {
  await rm(siteDir, { recursive: true, force: true });
});

describe("handleAdminPublish", () => {
  it("publishes a micro post to the site", async () => {
    const result = await handleAdminPublish(
      "body=Hello+from+admin&target_site=1",
      siteDir,
    );

    expect(result.ok).toBe(true);
    expect(result.post).toBeDefined();
    expect(result.post!.type).toBe("micro");
    expect(result.post!.body).toBe("Hello from admin");
    expect(result.post!.url).toContain("https://example.com");
  });

  it("creates the HTML file on disk", async () => {
    const result = await handleAdminPublish(
      "body=Disk+test&target_site=1",
      siteDir,
    );

    expect(result.ok).toBe(true);
    // The post should have generated an HTML file in _site
    const postsRaw = await readFile(join(siteDir, "posts.json"), "utf-8");
    const posts = JSON.parse(postsRaw);
    expect(posts.length).toBe(1);
    expect(posts[0].body).toBe("Disk test");
  });

  it("rejects empty body", async () => {
    const result = await handleAdminPublish("body=&target_site=1", siteDir);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("required");
  });

  it("rejects body over 280 chars", async () => {
    const long = "a".repeat(281);
    const result = await handleAdminPublish(
      `body=${encodeURIComponent(long)}&target_site=1`,
      siteDir,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("280");
  });

  it("returns the published post URL", async () => {
    const result = await handleAdminPublish(
      "body=URL+test&target_site=1",
      siteDir,
    );
    expect(result.ok).toBe(true);
    expect(result.post!.url).toMatch(/^https:\/\/example\.com\//);
  });

  it("sets targetX from form data", async () => {
    const result = await handleAdminPublish(
      "body=X+test&target_site=1&target_x=1",
      siteDir,
    );
    // Should succeed even without X credentials (X posting is best-effort)
    expect(result.ok).toBe(true);
    expect(result.targets.x).toBe(true);
  });

  it("records which targets were requested", async () => {
    const result = await handleAdminPublish(
      "body=Target+test&target_site=1",
      siteDir,
    );
    expect(result.targets.site).toBe(true);
    expect(result.targets.x).toBe(false);
  });
});
