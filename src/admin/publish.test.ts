import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseAdminForm, buildContentFromForm } from "./publish.js";
import type { SiteConfig } from "../config/types.js";

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
  siteDir = await mkdtemp(join(tmpdir(), "rsslobster-admin-"));
  await writeFile(
    join(siteDir, "rsslobster.json"),
    JSON.stringify(CONFIG),
  );
  // Create _site directory for output
  await mkdir(join(siteDir, "_site"), { recursive: true });
});

afterEach(async () => {
  await rm(siteDir, { recursive: true, force: true });
});

describe("parseAdminForm", () => {
  it("extracts body from URL-encoded form data", () => {
    const result = parseAdminForm("body=Hello+world&target_site=1");
    expect(result.body).toBe("Hello world");
    expect(result.targetSite).toBe(true);
  });

  it("extracts all publish targets", () => {
    const result = parseAdminForm("body=Test&target_site=1&target_x=1");
    expect(result.targetSite).toBe(true);
    expect(result.targetX).toBe(true);
  });

  it("defaults targets to false when missing", () => {
    const result = parseAdminForm("body=Test");
    expect(result.targetSite).toBe(false);
    expect(result.targetX).toBe(false);
  });

  it("handles URL-encoded special characters", () => {
    const result = parseAdminForm("body=Hello%20%26%20goodbye&target_site=1");
    expect(result.body).toBe("Hello & goodbye");
  });

  it("trims whitespace from body", () => {
    const result = parseAdminForm("body=++Hello++");
    expect(result.body).toBe("Hello");
  });
});

describe("buildContentFromForm", () => {
  it("creates micro content for short text without image", () => {
    const content = buildContentFromForm({ body: "Hello world", targetSite: true, targetX: false });
    expect(content.type).toBe("micro");
    expect(content.body).toBe("Hello world");
    expect(content.slug).toBeTruthy();
    expect(content.tags).toEqual([]);
  });

  it("creates image content when imagePath is provided", () => {
    const content = buildContentFromForm({
      body: "A nice sunset",
      targetSite: true,
      targetX: false,
      imagePath: "/tmp/sunset.jpg",
      imageFilename: "sunset.jpg",
    });
    expect(content.type).toBe("image");
    expect(content.body).toBe("A nice sunset");
  });

  it("generates a slug from body text", () => {
    const content = buildContentFromForm({ body: "The coffee in Lisbon is incredible", targetSite: true, targetX: false });
    expect(content.slug).toMatch(/^[a-z0-9-]+$/);
    expect(content.slug.length).toBeGreaterThan(0);
  });

  it("sets timestamps", () => {
    const content = buildContentFromForm({ body: "Test", targetSite: true, targetX: false });
    expect(content.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(content.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("rejects empty body", () => {
    expect(() => buildContentFromForm({ body: "", targetSite: true, targetX: false })).toThrow();
  });

  it("rejects body over 280 chars", () => {
    const long = "a".repeat(281);
    expect(() => buildContentFromForm({ body: long, targetSite: true, targetX: false })).toThrow();
  });
});
