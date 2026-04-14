import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtemp, readFile, writeFile, access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldSite, addContent } from "../generator/site.js";
import type { SiteConfig, ClassifiedContent } from "../config/types.js";

function fakeComments(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    slug: "hello-test",
    author: `Author${i + 1}`,
    body: `Comment body ${i + 1}`,
    status: "approved" as const,
    createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
  }));
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

const MICRO: ClassifiedContent = {
  type: "micro",
  body: "Hello from the test suite",
  slug: "hello-test",
  tags: ["test"],
  createdAt: "2025-03-15T10:00:00Z",
  updatedAt: "2025-03-15T10:00:00Z",
};

const SITE_CONFIG: SiteConfig = {
  domain: "example.com",
  title: "Test Blog",
  description: "A test blog",
  author: "Tester",
  language: "en",
  style: { preset: "minimal" },
  repo: "",
  commentsEndpoint: "https://comments.example.com",
};

vi.mock("ziscus", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ziscus")>();
  return {
    ...actual,
    fetchComments: vi.fn().mockResolvedValue([]),
  };
});

import { fetchComments } from "ziscus";
import { regenerateSite } from "./regenerate.js";

const mockFetchComments = fetchComments as ReturnType<typeof vi.fn>;

describe("comment pagination in regenerateSite", () => {
  let siteDir: string;

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-regen-pag-"));
    mockFetchComments.mockReset().mockResolvedValue([]);
  });

  it("generates only index.html when comments <= 200", async () => {
    mockFetchComments.mockResolvedValue(fakeComments(200));
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);
    await regenerateSite(siteDir);

    const outDir = join(siteDir, "_site");
    expect(await exists(join(outDir, "posts", "hello-test", "index.html"))).toBe(true);
    expect(await exists(join(outDir, "posts", "hello-test", "2"))).toBe(false);
  });

  it("generates page 2 when comments > 200", async () => {
    mockFetchComments.mockResolvedValue(fakeComments(201));
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);
    await regenerateSite(siteDir);

    const outDir = join(siteDir, "_site");
    expect(await exists(join(outDir, "posts", "hello-test", "2", "index.html"))).toBe(true);

    const page2 = await readFile(join(outDir, "posts", "hello-test", "2", "index.html"), "utf-8");
    expect(page2).toContain("comment-pagination");
    expect(page2).toContain("Hello from the test suite");
  });

  it("cleans stale page directories when comment count drops", async () => {
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);
    const outDir = join(siteDir, "_site");
    const staleDir = join(outDir, "posts", "hello-test", "3");
    await mkdir(staleDir, { recursive: true });
    await writeFile(join(staleDir, "index.html"), "stale");

    mockFetchComments.mockResolvedValue(fakeComments(50));
    await regenerateSite(siteDir);

    expect(await exists(staleDir)).toBe(false);
  });

  it("respects commentsPerPage config", async () => {
    const customConfig = { ...SITE_CONFIG, commentsPerPage: 5 };
    mockFetchComments.mockResolvedValue(fakeComments(12));
    await scaffoldSite(siteDir, customConfig);
    await addContent(siteDir, MICRO);
    await regenerateSite(siteDir);

    const outDir = join(siteDir, "_site");
    expect(await exists(join(outDir, "posts", "hello-test", "2", "index.html"))).toBe(true);
    expect(await exists(join(outDir, "posts", "hello-test", "3", "index.html"))).toBe(true);
    expect(await exists(join(outDir, "posts", "hello-test", "4"))).toBe(false);
  });

  it("post content appears on all generated pages", async () => {
    mockFetchComments.mockResolvedValue(fakeComments(401));
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);
    await regenerateSite(siteDir);

    const outDir = join(siteDir, "_site");
    for (const p of ["index.html", "2/index.html", "3/index.html"]) {
      const html = await readFile(join(outDir, "posts", "hello-test", p), "utf-8");
      expect(html).toContain("Hello from the test suite");
    }
  });

  it("page 1 has no prev link, last page has no next link", async () => {
    mockFetchComments.mockResolvedValue(fakeComments(401));
    await scaffoldSite(siteDir, SITE_CONFIG);
    await addContent(siteDir, MICRO);
    await regenerateSite(siteDir);

    const outDir = join(siteDir, "_site");
    const page1 = await readFile(join(outDir, "posts", "hello-test", "index.html"), "utf-8");
    const page3 = await readFile(join(outDir, "posts", "hello-test", "3", "index.html"), "utf-8");

    expect(page1).not.toContain("Previous");
    expect(page1).toContain("/posts/hello-test/2/");
    expect(page3).toContain("Previous");
    expect(page3).not.toContain("/posts/hello-test/4/");
  });
});
