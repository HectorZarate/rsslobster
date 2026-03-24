import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, readdir, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getNavPages, renderNav, renderPageLinks, generatePageHtml, writePages } from "./pages.js";
import type { SiteConfig, PageConfig } from "../config/types.js";

const CONFIG: SiteConfig = {
  domain: "example.com",
  title: "Test Blog",
  description: "A test blog",
  author: "Test Author",
  language: "en",
  style: { preset: "minimal" },
  repo: "",
};

describe("getNavPages", () => {
  it("returns empty array when no pages", () => {
    expect(getNavPages(CONFIG)).toEqual([]);
  });

  it("returns only pages with navOrder", () => {
    const config = {
      ...CONFIG,
      pages: [
        { title: "About", slug: "about", body: "About", navOrder: 1 },
        { title: "Hidden", slug: "hidden", body: "Hidden" },
        { title: "Contact", slug: "contact", body: "Contact", navOrder: 2 },
      ],
    };
    const nav = getNavPages(config);
    expect(nav).toHaveLength(2);
    expect(nav[0]!.slug).toBe("about");
    expect(nav[1]!.slug).toBe("contact");
  });

  it("sorts by navOrder", () => {
    const config = {
      ...CONFIG,
      pages: [
        { title: "Contact", slug: "contact", body: "Contact", navOrder: 10 },
        { title: "About", slug: "about", body: "About", navOrder: 1 },
      ],
    };
    const nav = getNavPages(config);
    expect(nav[0]!.slug).toBe("about");
    expect(nav[1]!.slug).toBe("contact");
  });
});

describe("renderNav", () => {
  it("renders site title only when no pages", () => {
    const nav = renderNav(CONFIG);
    expect(nav).toContain("Test Blog");
    expect(nav).toContain('href="/"');
  });

  it("includes page links", () => {
    const config = {
      ...CONFIG,
      pages: [
        { title: "About", slug: "about", body: "About", navOrder: 1 },
      ],
    };
    const nav = renderNav(config);
    expect(nav).toContain('href="/about.html"');
    expect(nav).toContain("About");
  });
});

describe("generatePageHtml", () => {
  const page: PageConfig = {
    title: "About Me",
    slug: "about",
    body: "I am a person who writes things.",
    navOrder: 1,
  };

  it("renders valid HTML with correct structure", () => {
    const html = generatePageHtml(page, CONFIG);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<h1>About Me</h1>");
    expect(html).toContain("I am a person who writes things.");
    expect(html).toContain("<title>About Me — Test Blog</title>");
  });

  it("includes feed links", () => {
    const html = generatePageHtml(page, CONFIG);
    expect(html).toContain('href="/feed.xml"');
    expect(html).toContain('href="/feed.json"');
  });

  it("includes nav", () => {
    const configWithPages = {
      ...CONFIG,
      pages: [page],
    };
    const html = generatePageHtml(page, configWithPages);
    expect(html).toContain('href="/about.html"');
  });

  it("escapes XSS in page content", () => {
    const xssPage = { ...page, body: '<script>alert("xss")</script>' };
    const html = generatePageHtml(xssPage, CONFIG);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain("&lt;script&gt;");
  });

  it("accepts plugin injections", () => {
    const html = generatePageHtml(page, CONFIG, {
      head: '<meta name="custom" content="test">',
      bodyEnd: '<script src="analytics.js"></script>',
    });
    expect(html).toContain('name="custom"');
    expect(html).toContain("analytics.js");
  });
});

describe("renderPageLinks", () => {
  it("returns empty string when no pages", () => {
    expect(renderPageLinks(CONFIG)).toBe("");
  });

  it("renders page links without home link", () => {
    const config = {
      ...CONFIG,
      pages: [
        { title: "About", slug: "about", body: "About", navOrder: 1 },
      ],
    };
    const links = renderPageLinks(config);
    expect(links).toContain("About");
    expect(links).toContain("/about.html");
    // Should NOT contain the home link
    expect(links).not.toContain('href="/"');
  });
});

describe("writePages", () => {
  let siteDir: string;

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-pages-"));
    await mkdir(join(siteDir, "_site"), { recursive: true });
  });

  afterEach(async () => {
    await rm(siteDir, { recursive: true, force: true });
  });

  it("writes valid page HTML files", async () => {
    const config = {
      ...CONFIG,
      pages: [{ title: "About", slug: "about", body: "About me", navOrder: 1 }],
    };
    await writePages(siteDir, config);

    const html = await readFile(join(siteDir, "_site", "about.html"), "utf-8");
    expect(html).toContain("About me");
  });

  it("skips pages with path traversal slugs", async () => {
    const config = {
      ...CONFIG,
      pages: [
        { title: "Evil", slug: "../evil", body: "malicious" },
        { title: "Good", slug: "good", body: "safe" },
      ],
    };
    await writePages(siteDir, config);

    const files = await readdir(join(siteDir, "_site"));
    expect(files).toContain("good.html");
    expect(files).not.toContain("evil.html");
  });

  it("skips pages with uppercase or special chars in slug", async () => {
    const config = {
      ...CONFIG,
      pages: [
        { title: "Bad", slug: "BAD", body: "bad" },
        { title: "Also Bad", slug: "foo/bar", body: "bad" },
      ],
    };
    await writePages(siteDir, config);

    const files = await readdir(join(siteDir, "_site"));
    // Only _site dir exists, no page files generated
    expect(files).toHaveLength(0);
  });
});
