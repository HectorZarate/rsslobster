import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldSite, readPostsIndex, addContent } from "../generator/site.js";
import { deleteCommand } from "./delete.js";
import type { SiteConfig, ClassifiedContent } from "../config/types.js";

const SITE_CONFIG: SiteConfig = {
  domain: "example.com",
  title: "Test Blog",
  description: "A test blog",
  author: "Tester",
  language: "en",
  style: { preset: "minimal" },
  repo: "",
};

const MICRO: ClassifiedContent = {
  type: "micro",
  body: "A post to delete",
  slug: "a-post-to-delete",
  tags: [],
  createdAt: "2026-03-25T01:00:00Z",
  updatedAt: "2026-03-25T01:00:00Z",
};

const KEEPER: ClassifiedContent = {
  type: "post",
  title: "Keep This",
  body: "This post should remain.",
  slug: "keep-this",
  tags: [],
  createdAt: "2026-03-25T02:00:00Z",
  updatedAt: "2026-03-25T02:00:00Z",
};

describe("deleteCommand", () => {
  let siteDir: string;

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-delete-"));
  });

  it("is named delete", () => {
    expect(deleteCommand.name()).toBe("delete");
  });

  it("deletes a post by slug", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);
    await addContent(siteDir, KEEPER);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    await deleteCommand.parseAsync(["node", "test", "a-post-to-delete", "--site-dir", siteDir]);

    expect(logs.some((l) => l.includes("Deleted"))).toBe(true);
    expect(logs.some((l) => l.includes("a-post-to-delete"))).toBe(true);

    const posts = await readPostsIndex(siteDir);
    expect(posts).toHaveLength(1);
    expect(posts[0]!.slug).toBe("keep-this");

    vi.restoreAllMocks();
  });

  it("errors on nonexistent slug", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    await expect(
      deleteCommand.parseAsync(["node", "test", "nonexistent", "--site-dir", siteDir]),
    ).rejects.toThrow("process.exit");

    // Post still exists
    const posts = await readPostsIndex(siteDir);
    expect(posts).toHaveLength(1);

    vi.restoreAllMocks();
  });
});
