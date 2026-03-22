import { describe, it, expect, beforeAll } from "vitest";
import {
  initMarkdown,
  renderMarkdown,
  renderInline,
} from "../generator/markdown.js";

beforeAll(async () => {
  await initMarkdown();
});

// ---------------------------------------------------------------------------
// Basic markdown rendering
// ---------------------------------------------------------------------------

describe("renderMarkdown — basic", () => {
  it("wraps plain text in <p>", () => {
    const result = renderMarkdown("Hello world.");
    expect(result.trim()).toBe("<p>Hello world.</p>");
  });

  it("renders **bold** as <strong>", () => {
    expect(renderMarkdown("**bold text**")).toContain(
      "<strong>bold text</strong>",
    );
  });

  it("renders *italic* as <em>", () => {
    expect(renderMarkdown("*italic text*")).toContain("<em>italic text</em>");
  });

  it("renders `inline code` as <code>", () => {
    expect(renderMarkdown("`const x = 1`")).toContain(
      "<code>const x = 1</code>",
    );
  });

  it("renders [link](url) as <a>", () => {
    const result = renderMarkdown("[click](https://example.com)");
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain("click</a>");
  });

  it("renders > blockquote", () => {
    expect(renderMarkdown("> quoted text")).toContain("<blockquote>");
    expect(renderMarkdown("> quoted text")).toContain("quoted text");
  });

  it("renders unordered lists", () => {
    const result = renderMarkdown("- item one\n- item two");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>item one</li>");
    expect(result).toContain("<li>item two</li>");
  });

  it("renders ordered lists", () => {
    const result = renderMarkdown("1. first\n2. second");
    expect(result).toContain("<ol>");
    expect(result).toContain("<li>first</li>");
    expect(result).toContain("<li>second</li>");
  });

  it("renders --- as <hr>", () => {
    expect(renderMarkdown("above\n\n---\n\nbelow")).toContain("<hr>");
  });

  it("renders h2-h6 headers", () => {
    expect(renderMarkdown("## Heading 2")).toContain("<h2>Heading 2</h2>");
    expect(renderMarkdown("### Heading 3")).toContain("<h3>Heading 3</h3>");
    expect(renderMarkdown("#### Heading 4")).toContain("<h4>Heading 4</h4>");
    expect(renderMarkdown("##### Heading 5")).toContain("<h5>Heading 5</h5>");
    expect(renderMarkdown("###### Heading 6")).toContain("<h6>Heading 6</h6>");
  });

  it("renders multiple paragraphs", () => {
    const result = renderMarkdown("First paragraph.\n\nSecond paragraph.");
    expect(result).toContain("<p>First paragraph.</p>");
    expect(result).toContain("<p>Second paragraph.</p>");
  });

  it("returns empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
  });

  it("auto-links URLs via linkify", () => {
    const result = renderMarkdown("Visit https://example.com for more.");
    expect(result).toContain('href="https://example.com"');
  });

  it("applies typographer — smart quotes and ellipsis", () => {
    const result = renderMarkdown('"Hello"... world');
    expect(result).toContain("\u201C"); // left double quote
    expect(result).toContain("\u2026"); // ellipsis
  });
});

// ---------------------------------------------------------------------------
// Syntax highlighting (shiki)
// ---------------------------------------------------------------------------

describe("renderMarkdown — syntax highlighting", () => {
  it("highlights fenced code blocks with language hint", () => {
    const result = renderMarkdown("```js\nconst x = 1;\n```");
    // Shiki generates spans with CSS variable colors
    expect(result).toContain("--shiki-token-keyword");
    expect(result).toContain('class="shiki');
    expect(result).toContain("const");
  });

  it("renders code block without language as plain pre/code", () => {
    const result = renderMarkdown("```\nplain text\n```");
    expect(result).toContain("<pre");
    expect(result).toContain("plain text");
  });

  it("does not double-escape entities in code blocks", () => {
    const result = renderMarkdown("```html\n<div>hello</div>\n```");
    // Shiki escapes < as &#x3C; — valid HTML numeric entity
    expect(result).toContain("&#x3C;");
    expect(result).toContain("div");
    // Must NOT double-escape: no &amp;#x3C; or &amp;lt;
    expect(result).not.toContain("&amp;#x3C;");
    expect(result).not.toContain("&amp;lt;");
  });

  it("handles unknown language gracefully — falls back to text", () => {
    // Should not crash — falls back to plain text via fallbackLanguage
    const result = renderMarkdown("```nonexistentlang\nsome code\n```");
    expect(result).toContain("some code");
    expect(result).toContain("<pre");
  });

  it("highlights multiple languages correctly", () => {
    const input = "```python\ndef foo():\n  pass\n```\n\n```rust\nfn main() {}\n```";
    const result = renderMarkdown(input);
    expect(result).toContain("def");
    expect(result).toContain("main");
    // Both should have shiki classes
    const shikiMatches = result.match(/class="shiki/g);
    expect(shikiMatches?.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Math rendering (temml → MathML)
// ---------------------------------------------------------------------------

describe("renderMarkdown — math", () => {
  it("renders inline math $...$ to MathML", () => {
    const result = renderMarkdown("The formula $x^2$ is simple.");
    expect(result).toContain("<math>");
    expect(result).toContain("</math>");
    expect(result).toContain("<msup>");
  });

  it("renders display math $$...$$ to block MathML", () => {
    const result = renderMarkdown("$$\n\\int_0^1 f(x)dx\n$$");
    expect(result).toContain('<math display="block"');
    expect(result).toContain("∫"); // integral symbol
  });

  it("renders single-line display math", () => {
    const result = renderMarkdown("$$ E = mc^2 $$");
    expect(result).toContain('<math display="block"');
    expect(result).toContain("<msup>");
  });

  it("handles malformed LaTeX without crashing", () => {
    const result = renderMarkdown("$\\invalid{$");
    // Should contain some fallback, not crash
    expect(result).toBeDefined();
    expect(result.length).toBeGreaterThan(0);
  });

  it("renders math inside other markdown", () => {
    const result = renderMarkdown("**Bold** with $x^2$ inline.");
    expect(result).toContain("<strong>Bold</strong>");
    expect(result).toContain("<math>");
  });

  it("does not treat single $ as math delimiter", () => {
    const result = renderMarkdown("Price is $5 and $10.");
    // No closing $ that matches, so should not render as math
    expect(result).not.toContain("<math>");
  });

  it("does not treat $$ in middle of text as display math", () => {
    const result = renderMarkdown("Costs $$$ a lot");
    // Should not create block math from mismatched $$
    expect(result).not.toContain('<math display="block"');
  });
});

// ---------------------------------------------------------------------------
// Header shifting
// ---------------------------------------------------------------------------

describe("renderMarkdown — heading shift", () => {
  it("shifts h1 → h2 when shiftHeadings is true", () => {
    const result = renderMarkdown("# Top heading", true);
    expect(result).toContain("<h2>");
    expect(result).not.toContain("<h1>");
  });

  it("shifts h2 → h3", () => {
    const result = renderMarkdown("## Second", true);
    expect(result).toContain("<h3>");
    expect(result).not.toContain("<h2>");
  });

  it("does not shift past h6", () => {
    const result = renderMarkdown("###### Heading 6", true);
    expect(result).toContain("<h6>");
  });

  it("does not shift when shiftHeadings is false", () => {
    const result = renderMarkdown("# Top heading", false);
    expect(result).toContain("<h1>");
  });

  it("shifts multiple headings in same document", () => {
    const result = renderMarkdown("# H1\n\n## H2\n\n### H3", true);
    expect(result).toContain("<h2>");
    expect(result).toContain("<h3>");
    expect(result).toContain("<h4>");
    expect(result).not.toContain("<h1>");
  });
});

// ---------------------------------------------------------------------------
// Inline-only rendering
// ---------------------------------------------------------------------------

describe("renderInline", () => {
  it("renders bold and italic", () => {
    const result = renderInline("**bold** and *italic*");
    expect(result).toContain("<strong>bold</strong>");
    expect(result).toContain("<em>italic</em>");
  });

  it("renders inline code", () => {
    expect(renderInline("`code`")).toContain("<code>code</code>");
  });

  it("renders links", () => {
    const result = renderInline("[link](https://example.com)");
    expect(result).toContain('href="https://example.com"');
  });

  it("does NOT wrap in <p> tags", () => {
    const result = renderInline("Just text");
    expect(result).not.toContain("<p>");
    expect(result).toBe("Just text");
  });

  it("renders inline math $...$", () => {
    const result = renderInline("Energy: $E = mc^2$");
    expect(result).toContain("<math>");
  });

  it("returns empty string for empty input", () => {
    expect(renderInline("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

describe("renderMarkdown — security", () => {
  it("escapes raw <script> tags", () => {
    const result = renderMarkdown('<script>alert("xss")</script>');
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("escapes raw <img onerror> tags", () => {
    const result = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(result).toContain("&lt;img");
    expect(result).not.toContain("<img src=x");
  });

  it("does NOT render javascript: URLs as clickable links", () => {
    const result = renderMarkdown("[click](javascript:alert(1))");
    // markdown-it should not create an <a> with javascript: protocol
    expect(result).not.toContain('href="javascript:');
  });

  it("escapes HTML in inline rendering too", () => {
    const result = renderInline('<script>alert("xss")</script>');
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("does not double-escape code block content", () => {
    const result = renderMarkdown("```\n<div>&amp;</div>\n```");
    // Shiki escapes < as &#x3C; and & as &#x26; — HTML numeric entities
    expect(result).toContain("&#x3C;");
    expect(result).toContain("&#x26;");
    // Must NOT triple-escape
    expect(result).not.toContain("&amp;amp;amp;");
  });

  it("handles XSS in code block language name", () => {
    // Unknown language falls back to text — no script injection
    const result = renderMarkdown('```<script>alert(1)</script>\ncode\n```');
    expect(result).not.toContain("<script>alert");
    expect(result).toContain("code");
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("renderMarkdown — edge cases", () => {
  it("handles whitespace-only input", () => {
    const result = renderMarkdown("   \n  \n   ");
    expect(result.trim()).toBe("");
  });

  it("handles nested markdown correctly", () => {
    const result = renderMarkdown("- **bold** in a *list* with `code`");
    expect(result).toContain("<ul>");
    expect(result).toContain("<strong>bold</strong>");
    expect(result).toContain("<em>list</em>");
    expect(result).toContain("<code>code</code>");
  });

  it("handles unicode content (CJK, emoji)", () => {
    const result = renderMarkdown("こんにちは 🌍 مرحبا");
    expect(result).toContain("こんにちは");
    expect(result).toContain("🌍");
    expect(result).toContain("مرحبا");
  });

  it("idempotent initMarkdown — calling twice does not crash", async () => {
    await initMarkdown(); // second call
    const result = renderMarkdown("still works");
    expect(result).toContain("still works");
  });
});
