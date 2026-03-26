import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getNavPages, renderNav, renderPageLinks, generatePageHtml, writePages, resolvePageBody } from "./pages.js";
import type { SiteConfig, PageConfig } from "../config/types.js";
import { initMarkdown } from "../generator/markdown.js";

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

describe("resolvePageBody", () => {
  let siteDir: string;

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-pagebody-"));
  });

  afterEach(async () => {
    await rm(siteDir, { recursive: true, force: true });
  });

  it("returns inline body when no bodyFile", async () => {
    const page: PageConfig = { title: "Test", slug: "test", body: "inline content" };
    const result = await resolvePageBody(page, siteDir);
    expect(result).toBe("inline content");
  });

  it("reads body from a .md file and renders markdown", async () => {
    await initMarkdown();
    await writeFile(join(siteDir, "about.md"), "# Hello\n\nThis is **bold**.");
    const page: PageConfig = { title: "About", slug: "about", body: "", bodyFile: "about.md" };
    const result = await resolvePageBody(page, siteDir);
    expect(result).toContain("<h1>Hello</h1>");
    expect(result).toContain("<strong>bold</strong>");
  });

  it("reads body from a .html file as-is", async () => {
    await writeFile(join(siteDir, "landing.html"), '<div class="hero"><h1>Welcome</h1></div>');
    const page: PageConfig = { title: "Home", slug: "home", body: "", bodyFile: "landing.html" };
    const result = await resolvePageBody(page, siteDir);
    expect(result).toContain('<div class="hero">');
    expect(result).toContain("<h1>Welcome</h1>");
  });

  it("falls back to inline body if bodyFile not found", async () => {
    const page: PageConfig = { title: "Test", slug: "test", body: "fallback", bodyFile: "missing.md" };
    const result = await resolvePageBody(page, siteDir);
    expect(result).toBe("fallback");
  });

  it("rejects path traversal in bodyFile", async () => {
    const page: PageConfig = { title: "Evil", slug: "evil", body: "safe", bodyFile: "../../../etc/passwd" };
    const result = await resolvePageBody(page, siteDir);
    expect(result).toBe("safe");
  });
});

describe("homepage override", () => {
  let siteDir: string;

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-homepage-"));
    await mkdir(join(siteDir, "_site"), { recursive: true });
  });

  afterEach(async () => {
    await rm(siteDir, { recursive: true, force: true });
  });

  it("writes homepage page as index.html when homepage is set", async () => {
    await writeFile(join(siteDir, "landing.html"), '<div class="hero"><h1>RSS Lobster</h1></div>');
    const config: SiteConfig = {
      ...CONFIG,
      homepage: "landing",
      pages: [
        { title: "RSS Lobster", slug: "landing", body: "", bodyFile: "landing.html" },
      ],
    };
    await writePages(siteDir, config);

    const indexHtml = await readFile(join(siteDir, "_site", "index.html"), "utf-8");
    expect(indexHtml).toContain("RSS Lobster");
    expect(indexHtml).toContain("hero");
  });

  it("does not write homepage page as slug.html", async () => {
    const config: SiteConfig = {
      ...CONFIG,
      homepage: "landing",
      pages: [
        { title: "Home", slug: "landing", body: "Welcome home" },
        { title: "About", slug: "about", body: "About us", navOrder: 1 },
      ],
    };
    await writePages(siteDir, config);

    const files = await readdir(join(siteDir, "_site"));
    expect(files).toContain("index.html");
    expect(files).toContain("about.html");
    expect(files).not.toContain("landing.html");
  });

  it("uses rendered markdown from bodyFile for homepage", async () => {
    await initMarkdown();
    await writeFile(join(siteDir, "home.md"), "# Welcome\n\n```bash\nnpm install -g rsslobster\n```");
    const config: SiteConfig = {
      ...CONFIG,
      homepage: "home",
      pages: [
        { title: "RSS Lobster", slug: "home", body: "", bodyFile: "home.md" },
      ],
    };
    await writePages(siteDir, config);

    const html = await readFile(join(siteDir, "_site", "index.html"), "utf-8");
    expect(html).toContain("<h1>Welcome</h1>");
    expect(html).toContain("language-bash");
  });
});

describe("raw layout", () => {
  const RAW_BODY = '<section class="profile"><img src="/headshot.jpg"><h1>Jane Doe</h1></section>';

  it("omits blog chrome — no nav, header, article, h1 wrapper, skip-link, footer", () => {
    const page: PageConfig = {
      title: "Jane Doe",
      slug: "home",
      body: "",
      layout: "raw",
    };
    const html = generatePageHtml(page, CONFIG, undefined, RAW_BODY);
    // Check the body section (after </head>) for absence of chrome
    const bodySection = html.split("</head>")[1] ?? "";
    expect(bodySection).not.toContain('<a class="skip-link"');
    expect(bodySection).not.toContain("<nav>");
    expect(bodySection).not.toContain("<header>");
    expect(bodySection).not.toContain("<article>");
    expect(bodySection).not.toContain("<footer");
    // The h1 inside the raw body is the user's, not RSS Lobster's wrapper
    expect(html).toContain('<section class="profile">');
    expect(html).toContain("Jane Doe");
  });

  it("still includes head section with CSS, meta, OG, and feed links", () => {
    const page: PageConfig = {
      title: "Jane Doe",
      slug: "home",
      body: "Portfolio site",
      layout: "raw",
    };
    const html = generatePageHtml(page, CONFIG, undefined, RAW_BODY);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("<style>");
    expect(html).toContain("og:title");
    expect(html).toContain("feed.xml");
    expect(html).toContain("feed.json");
  });

  it("includes footer when showFooter is true", () => {
    const page: PageConfig = {
      title: "Jane Doe",
      slug: "home",
      body: "",
      layout: "raw",
      showFooter: true,
    };
    const html = generatePageHtml(page, CONFIG, undefined, RAW_BODY);
    expect(html).not.toContain("<nav>");
    expect(html).not.toContain("<article>");
    expect(html).toContain("site-footer");
    expect(html).toContain("Powered by");
  });

  it("default layout is unchanged — regression", () => {
    const page: PageConfig = {
      title: "About",
      slug: "about",
      body: "About this site",
    };
    const html = generatePageHtml(page, CONFIG);
    expect(html).toContain("skip-link");
    expect(html).toContain("<nav>");
    expect(html).toContain("<header>");
    expect(html).toContain("<article>");
    expect(html).toContain("<h1>About</h1>");
    expect(html).toContain("site-footer");
    expect(html).toContain("About this site");
  });

  it("default layout with showFooter false suppresses footer", () => {
    const page: PageConfig = {
      title: "About",
      slug: "about",
      body: "About this site",
      showFooter: false,
    };
    const html = generatePageHtml(page, CONFIG);
    const bodySection = html.split("</head>")[1] ?? "";
    expect(bodySection).toContain("<nav>");
    expect(bodySection).toContain("<article>");
    expect(bodySection).toContain("<h1>About</h1>");
    expect(bodySection).not.toContain("<footer");
  });

  it("writePages with raw layout + homepage writes index.html with raw content", async () => {
    let siteDir = await mkdtemp(join(tmpdir(), "rsslobster-raw-"));
    await mkdir(join(siteDir, "_site"), { recursive: true });
    await writeFile(join(siteDir, "portfolio.html"), RAW_BODY);

    const config: SiteConfig = {
      ...CONFIG,
      homepage: "home",
      pages: [
        { title: "Jane Doe", slug: "home", body: "", bodyFile: "portfolio.html", layout: "raw", showFooter: true },
      ],
    };
    await writePages(siteDir, config);

    const html = await readFile(join(siteDir, "_site", "index.html"), "utf-8");
    expect(html).toContain('<section class="profile">');
    expect(html).not.toContain("<article>");
    expect(html).toContain("site-footer");

    await rm(siteDir, { recursive: true, force: true });
  });
});
