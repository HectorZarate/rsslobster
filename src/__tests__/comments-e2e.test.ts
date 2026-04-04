import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldSite, addContent } from "../generator/site.js";
import { regenerateSite } from "../cli/regenerate.js";
import type { SiteConfig, ClassifiedContent } from "../config/types.js";

const CONFIG: SiteConfig = {
  domain: "example.com",
  title: "Comments E2E",
  description: "Testing comments",
  author: "Tester",
  language: "en",
  style: { preset: "minimal" },
  repo: "",
};

const CONFIG_WITH_COMMENTS: SiteConfig = {
  ...CONFIG,
  commentsEndpoint: "https://comments.example.com",
};

const POST: ClassifiedContent = {
  type: "post",
  title: "Test Post",
  body: "This is a test post for comments.",
  slug: "test-post",
  tags: ["test"],
  createdAt: "2026-03-25T12:00:00.000Z",
  updatedAt: "2026-03-25T12:00:00.000Z",
};

const MICRO: ClassifiedContent = {
  type: "micro",
  body: "A micro post for comments testing.",
  slug: "micro-comments",
  tags: [],
  createdAt: "2026-03-26T12:00:00.000Z",
  updatedAt: "2026-03-26T12:00:00.000Z",
};

describe("E2E: comments in generated pages", () => {
  let siteDir: string;

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-comments-e2e-"));
  });

  afterEach(async () => {
    await rm(siteDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("page without commentsEndpoint has no comments section", async () => {
    await scaffoldSite(siteDir, CONFIG);
    await addContent(siteDir, POST);

    const html = await readFile(
      join(siteDir, "_site", "posts", "test-post", "index.html"),
      "utf-8",
    );
    expect(html).not.toContain('<section id="comments"');
    expect(html).not.toContain("comment-form");
  });

  it("page with commentsEndpoint includes comment form after regeneration", async () => {
    await scaffoldSite(siteDir, CONFIG_WITH_COMMENTS);
    await addContent(siteDir, POST);

    // Mock fetchComments to return empty (no comments yet)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("[]", { status: 200 })),
    );

    await regenerateSite(siteDir);

    const html = await readFile(
      join(siteDir, "_site", "posts", "test-post", "index.html"),
      "utf-8",
    );
    expect(html).toContain('<section id="comments"');
    expect(html).toContain("<form");
    expect(html).toContain('action="https://comments.example.com/submit"');
    expect(html).toContain('name="slug"');
    expect(html).toContain('value="test-post"');
  });

  it("page with comments includes rendered comments after regeneration", async () => {
    await scaffoldSite(siteDir, CONFIG_WITH_COMMENTS);
    await addContent(siteDir, POST);

    // Mock fetchComments to return some comments
    const mockComments = [
      {
        id: "c1",
        author: "Alice",
        body: "Great post!",
        createdAt: "2026-03-25T14:00:00Z",
        slug: "test-post",
        status: "approved",
      },
      {
        id: "c2",
        author: "Bob",
        body: "Interesting perspective.",
        createdAt: "2026-03-25T15:00:00Z",
        slug: "test-post",
        status: "approved",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockComments), { status: 200 }),
      ),
    );

    await regenerateSite(siteDir);

    const html = await readFile(
      join(siteDir, "_site", "posts", "test-post", "index.html"),
      "utf-8",
    );
    expect(html).toContain("Alice");
    expect(html).toContain("Great post!");
    expect(html).toContain("Bob");
    expect(html).toContain("Interesting perspective.");
    expect(html).toContain("2 Comments");
  });

  it("--slug rebuilds only target page with fresh comments", async () => {
    await scaffoldSite(siteDir, CONFIG_WITH_COMMENTS);
    await addContent(siteDir, POST);
    await addContent(siteDir, MICRO);

    // Mock fetch to return comments only for test-post
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/comments/test-post")) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  id: "c1",
                  author: "Charlie",
                  body: "Slug-specific comment!",
                  createdAt: "2026-03-25T16:00:00Z",
                  slug: "test-post",
                  status: "approved",
                },
              ]),
            ),
          );
        }
        return Promise.resolve(new Response("[]"));
      }),
    );

    // Corrupt the micro post to prove it's not touched
    const microPath = join(siteDir, "_site", "posts", "micro-comments", "index.html");
    await writeFile(microPath, "UNTOUCHED");

    await regenerateSite(siteDir, { slug: "test-post" });

    // Target page has the comment
    const postHtml = await readFile(
      join(siteDir, "_site", "posts", "test-post", "index.html"),
      "utf-8",
    );
    expect(postHtml).toContain("Charlie");
    expect(postHtml).toContain("Slug-specific comment!");

    // Other page untouched
    const microHtml = await readFile(microPath, "utf-8");
    expect(microHtml).toBe("UNTOUCHED");
  });

  it("XSS in comment data is escaped in rendered output", async () => {
    await scaffoldSite(siteDir, CONFIG_WITH_COMMENTS);
    await addContent(siteDir, POST);

    const xssComments = [
      {
        id: "xss1",
        author: '<script>alert("xss")</script>',
        body: '<img onerror="alert(1)" src=x>',
        createdAt: "2026-03-25T14:00:00Z",
        slug: "test-post",
        status: "approved",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(xssComments), { status: 200 }),
      ),
    );

    await regenerateSite(siteDir);

    const html = await readFile(
      join(siteDir, "_site", "posts", "test-post", "index.html"),
      "utf-8",
    );
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain('<img onerror');
    expect(html).toContain("&lt;script&gt;");
  });

  it("comments section has accessible heading and form labels", async () => {
    await scaffoldSite(siteDir, CONFIG_WITH_COMMENTS);
    await addContent(siteDir, POST);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("[]", { status: 200 })),
    );

    await regenerateSite(siteDir);

    const html = await readFile(
      join(siteDir, "_site", "posts", "test-post", "index.html"),
      "utf-8",
    );
    // Has heading
    expect(html).toContain("<h2>");
    // Has accessible form labels
    expect(html).toContain('for="comment-author"');
    expect(html).toContain('for="comment-body"');
    expect(html).toContain('id="comment-author"');
    expect(html).toContain('id="comment-body"');
  });

  it("comment form includes honeypot field", async () => {
    await scaffoldSite(siteDir, CONFIG_WITH_COMMENTS);
    await addContent(siteDir, POST);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("[]", { status: 200 })),
    );

    await regenerateSite(siteDir);

    const html = await readFile(
      join(siteDir, "_site", "posts", "test-post", "index.html"),
      "utf-8",
    );
    expect(html).toContain('name="website"');
    expect(html).toContain("hp-field");
  });

  it("comment styles use CSS custom properties", async () => {
    await scaffoldSite(siteDir, CONFIG_WITH_COMMENTS);
    await addContent(siteDir, POST);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("[]", { status: 200 })),
    );

    await regenerateSite(siteDir);

    const html = await readFile(
      join(siteDir, "_site", "posts", "test-post", "index.html"),
      "utf-8",
    );
    expect(html).toContain("var(--color-");
    expect(html).toContain(".comment");
  });
});
