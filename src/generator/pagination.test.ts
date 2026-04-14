import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, mkdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Comment } from "ziscus";
import {
  paginateComments,
  commentPageUrl,
  cleanStaleCommentPages,
} from "./pagination.js";

function fakeComments(n: number): Comment[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    slug: "test-post",
    author: `Author${i + 1}`,
    body: `Comment body ${i + 1}`,
    status: "approved" as const,
    createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
  }));
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("paginateComments", () => {
  it("returns one empty page for 0 comments", () => {
    expect(paginateComments([], 200)).toEqual([[]]);
  });

  it("returns one page for 1 comment", () => {
    const comments = fakeComments(1);
    const pages = paginateComments(comments, 200);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(1);
  });

  it("returns one page for 199 comments", () => {
    const pages = paginateComments(fakeComments(199), 200);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(199);
  });

  it("returns one page for exactly 200 comments", () => {
    const pages = paginateComments(fakeComments(200), 200);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(200);
  });

  it("returns two pages for 201 comments (200 + 1)", () => {
    const pages = paginateComments(fakeComments(201), 200);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(200);
    expect(pages[1]).toHaveLength(1);
  });

  it("returns two pages for 400 comments (200 + 200)", () => {
    const pages = paginateComments(fakeComments(400), 200);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(200);
    expect(pages[1]).toHaveLength(200);
  });

  it("returns three pages for 401 comments (200 + 200 + 1)", () => {
    const pages = paginateComments(fakeComments(401), 200);
    expect(pages).toHaveLength(3);
    expect(pages[0]).toHaveLength(200);
    expect(pages[1]).toHaveLength(200);
    expect(pages[2]).toHaveLength(1);
  });

  it("respects custom page size", () => {
    const pages = paginateComments(fakeComments(12), 5);
    expect(pages).toHaveLength(3);
    expect(pages[0]).toHaveLength(5);
    expect(pages[1]).toHaveLength(5);
    expect(pages[2]).toHaveLength(2);
  });

  it("preserves comment order across pages", () => {
    const comments = fakeComments(5);
    const pages = paginateComments(comments, 3);
    expect(pages[0]![0]!.id).toBe("c1");
    expect(pages[0]![2]!.id).toBe("c3");
    expect(pages[1]![0]!.id).toBe("c4");
    expect(pages[1]![1]!.id).toBe("c5");
  });
});

describe("commentPageUrl", () => {
  it("returns baseUrl for page 1", () => {
    expect(commentPageUrl("/posts/slug/", 1)).toBe("/posts/slug/");
  });

  it("returns baseUrl + 2/ for page 2", () => {
    expect(commentPageUrl("/posts/slug/", 2)).toBe("/posts/slug/2/");
  });

  it("returns baseUrl + 3/ for page 3", () => {
    expect(commentPageUrl("/posts/slug/", 3)).toBe("/posts/slug/3/");
  });

  it("works with non-default permalink dirs", () => {
    expect(commentPageUrl("/2026/04/my-post/", 2)).toBe(
      "/2026/04/my-post/2/",
    );
  });
});

describe("cleanStaleCommentPages", () => {
  let outDir: string;

  beforeEach(async () => {
    outDir = await mkdtemp(join(tmpdir(), "rsslobster-pagination-"));
  });

  it("removes numbered directories beyond currentPageCount", async () => {
    const slugDir = join(outDir, "posts", "my-post");
    await mkdir(join(slugDir, "2"), { recursive: true });
    await mkdir(join(slugDir, "3"), { recursive: true });
    await writeFile(join(slugDir, "2", "index.html"), "page2");
    await writeFile(join(slugDir, "3", "index.html"), "page3");

    await cleanStaleCommentPages(outDir, "posts/my-post", 1);

    expect(await exists(join(slugDir, "2"))).toBe(false);
    expect(await exists(join(slugDir, "3"))).toBe(false);
  });

  it("keeps directories within currentPageCount", async () => {
    const slugDir = join(outDir, "posts", "my-post");
    await mkdir(join(slugDir, "2"), { recursive: true });
    await mkdir(join(slugDir, "3"), { recursive: true });
    await writeFile(join(slugDir, "2", "index.html"), "page2");
    await writeFile(join(slugDir, "3", "index.html"), "page3");

    await cleanStaleCommentPages(outDir, "posts/my-post", 3);

    expect(await exists(join(slugDir, "2"))).toBe(true);
    expect(await exists(join(slugDir, "3"))).toBe(true);
  });

  it("is a no-op when no stale directories exist", async () => {
    const slugDir = join(outDir, "posts", "my-post");
    await mkdir(slugDir, { recursive: true });
    await writeFile(join(slugDir, "index.html"), "page1");

    await cleanStaleCommentPages(outDir, "posts/my-post", 1);

    expect(await exists(join(slugDir, "index.html"))).toBe(true);
  });

  it("does not remove non-numeric directories", async () => {
    const slugDir = join(outDir, "posts", "my-post");
    await mkdir(join(slugDir, "images"), { recursive: true });
    await writeFile(join(slugDir, "images", "photo.jpg"), "img");

    await cleanStaleCommentPages(outDir, "posts/my-post", 1);

    expect(await exists(join(slugDir, "images"))).toBe(true);
  });
});
