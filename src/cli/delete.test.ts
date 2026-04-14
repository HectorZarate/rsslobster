import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtemp, readFile, writeFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldSite, readPostsIndex, addContent } from "../generator/site.js";
import { outputDir } from "../config/paths.js";
import { deleteCommand } from "./delete.js";
import type { SiteConfig, ClassifiedContent } from "../config/types.js";

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

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

  it("removes image files referenced by the deleted post", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);

    const WITH_IMAGES: ClassifiedContent = {
      type: "image",
      title: "img post test",
      body: "img post test",
      slug: "img-post-test",
      tags: [],
      images: [
        { src: "/img/img-post-test-0.png", alt: "" },
        { src: "/img/img-post-test-1.png", alt: "" },
      ],
      createdAt: "2026-04-10T02:00:00Z",
      updatedAt: "2026-04-10T02:00:00Z",
    };

    await addContent(siteDir, KEEPER);
    await addContent(siteDir, WITH_IMAGES);

    // Simulate image files on disk (uploader writes them before addContent).
    const outDir = outputDir(siteDir);
    const imgDir = join(outDir, "img");
    await mkdir(imgDir, { recursive: true });
    const img0 = join(outDir, "img", "img-post-test-0.png");
    const img1 = join(outDir, "img", "img-post-test-1.png");
    await writeFile(img0, "fake-png-0");
    await writeFile(img1, "fake-png-1");

    vi.spyOn(console, "log").mockImplementation(() => {});

    await deleteCommand.parseAsync([
      "node",
      "test",
      "img-post-test",
      "--site-dir",
      siteDir,
    ]);

    expect(await exists(img0)).toBe(false);
    expect(await exists(img1)).toBe(false);

    vi.restoreAllMocks();
  });

  it("rebuilds adjacent posts so their prev/next nav drops the deleted slug", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);

    const OLDER: ClassifiedContent = {
      type: "post",
      title: "Older Post",
      body: "older",
      slug: "older-post",
      tags: [],
      createdAt: "2026-03-01T00:00:00Z",
      updatedAt: "2026-03-01T00:00:00Z",
    };
    const MIDDLE: ClassifiedContent = {
      type: "post",
      title: "Middle Post",
      body: "middle",
      slug: "middle-post",
      tags: [],
      createdAt: "2026-03-02T00:00:00Z",
      updatedAt: "2026-03-02T00:00:00Z",
    };
    const NEWER: ClassifiedContent = {
      type: "post",
      title: "Newer Post",
      body: "newer",
      slug: "newer-post",
      tags: [],
      createdAt: "2026-03-03T00:00:00Z",
      updatedAt: "2026-03-03T00:00:00Z",
    };

    await addContent(siteDir, OLDER);
    await addContent(siteDir, MIDDLE);
    await addContent(siteDir, NEWER);

    vi.spyOn(console, "log").mockImplementation(() => {});

    await deleteCommand.parseAsync([
      "node",
      "test",
      "middle-post",
      "--site-dir",
      siteDir,
    ]);

    const outDir = outputDir(siteDir);
    const newerHtml = await readFile(
      join(outDir, "posts", "newer-post", "index.html"),
      "utf-8",
    );
    const olderHtml = await readFile(
      join(outDir, "posts", "older-post", "index.html"),
      "utf-8",
    );

    expect(newerHtml).not.toContain("middle-post");
    expect(olderHtml).not.toContain("middle-post");
    // Positive: neighbors now point at each other.
    expect(newerHtml).toContain("older-post");
    expect(olderHtml).toContain("newer-post");

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
