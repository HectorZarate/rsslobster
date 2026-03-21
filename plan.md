# Markdown Rendering System — Implementation Plan

## Overview

Add markdown rendering with syntax highlighting and LaTeX/math support to rsslobster.
All rendering is server-side (build-time). Zero client-side JavaScript added.
Zero custom font files. Output is self-contained HTML+CSS.

## Dependencies (3 new production deps)

| Package | Purpose | Why this one |
|---|---|---|
| `markdown-it` | Markdown → HTML | Fast, pluggable, sync render. Lighter dep tree than unified/remark. |
| `shiki` | Syntax highlighting | Emits inline styles or CSS variables — no client JS/CSS needed. VS Code grammar accuracy. Official `@shikijs/markdown-it` integration. |
| `temml` | LaTeX → MathML | Native MathML output — zero custom fonts (uses system math fonts). Aligns with system-font-only philosophy. All modern browsers support MathML (Chrome 109+, Jan 2023). KaTeX would add ~1MB of web fonts — unacceptable. |

## Architecture

### New module: `src/generator/markdown.ts` (~100 lines)

```
initMarkdown()    → async, called once at startup. Creates shiki highlighter + markdown-it instance.
renderMarkdown()  → sync, full block-level markdown (posts, micros)
renderInline()    → sync, inline-only markdown (captions for image/video/audio/link)
```

- `markdown-it` config: `{ html: false, linkify: true, typographer: true }`
  - `html: false` is the security boundary — user HTML is escaped, only parser-generated HTML passes through
  - `linkify: true` — auto-link URLs (fits Telegram-to-blog workflow)
  - `typographer: true` — smart quotes, em-dashes
- Singleton pattern: shiki highlighter loads grammars once, `md.render()` is synchronous after init
- `generateHtmlPage()` stays synchronous — only `initMarkdown()` is async

### Shiki integration

- Use `@shikijs/markdown-it` (official first-party plugin)
- Use shiki's `css-variables` theme: emits `var(--shiki-*)` tokens
- Add `--shiki-*` CSS custom properties to each preset in `presets.ts`
  - minimal: muted earth tones on cream
  - brutalist: black/red/blue on white
  - magazine: warm editorial palette on linen
  - terminal: green/amber/cyan on dark
- Lazy-load languages: only common web languages by default (js, ts, python, rust, go, html, css, bash, json, sql, etc.), others on demand

### Temml integration

- Custom markdown-it plugin (~30 lines)
- `$...$` → inline math via `temml.renderToString(tex, { displayMode: false })`
- `$$...$$` → display math via `temml.renderToString(tex, { displayMode: true })`
- `throwOnError: false` — render raw TeX on parse failure, don't crash the build
- Add minimal MathML CSS to stylesheet (~5 lines for `math` element display/alignment)

### Header level shifting

- Custom markdown-it plugin (~5 lines): remap `h1` → `h2`, `h2` → `h3`, etc. in body content
- Prevents collision with post-level `<h1>` title
- Only active for content types that render a title (`post`)

### Content-type rendering strategy

| Type | Rendering | Rationale |
|---|---|---|
| `post` | Full markdown (blocks + inline), headers shifted +1 | Long-form, needs full formatting |
| `micro` | Full markdown (blocks + inline), no header shift | Short posts can still have code blocks, lists |
| `image` | Inline-only markdown (bold, italic, code, links) | Body is a caption |
| `carousel` | Inline-only markdown | Body is a caption |
| `link` | Inline-only markdown | Body is commentary |
| `video` | Inline-only markdown | Body is a caption |
| `audio` | Inline-only markdown | Body is a caption |

### Feed rendering

- RSS `<description>` and JSON Feed `content_html`: include rendered markdown HTML
- Feeds get full rendering including code highlighting
- RSS readers that support HTML show rich content; those that don't strip to plain text (standard behavior)

## Files Changed

1. **`src/generator/markdown.ts`** — NEW (~100 lines). Core rendering module.
2. **`src/generator/html.ts`** — Modify `renderContentBody()` to call `renderMarkdown()`/`renderInline()` instead of `escHtml()`. ~15 lines changed.
3. **`src/generator/site.ts`** — Call `initMarkdown()` at startup before first render. Feed descriptions use rendered markdown. ~5 lines changed.
4. **`src/styles/presets.ts`** — Add `--shiki-*` CSS custom properties to each preset. Add MathML display CSS. ~40 lines added.
5. **`src/__tests__/markdown.test.ts`** — NEW. Unit tests for markdown rendering.
6. **`src/__tests__/e2e.test.ts`** — Extend with markdown-specific integration tests.

## Testing Plan

### Unit tests: `src/__tests__/markdown.test.ts`

**Basic markdown rendering:**
- Plain text → `<p>` wrapped output
- `**bold**` → `<strong>`
- `*italic*` → `<em>`
- `` `inline code` `` → `<code>`
- `[link](url)` → `<a href="url">`
- `> blockquote` → `<blockquote>`
- Unordered/ordered lists → `<ul>/<ol>`
- `---` → `<hr>`
- Headers h2-h6 render at correct levels
- Multiple paragraphs separated by blank lines

**Syntax highlighting:**
- Fenced code block with language (` ```js `) → contains shiki-generated spans
- Fenced code block without language → plain `<pre><code>` (no highlighting)
- Code block preserves content exactly (no entity double-escaping)
- Unknown language name → falls back gracefully (no crash)

**Math rendering:**
- `$x^2$` inline → MathML `<math>` element (inline)
- `$$\int_0^1 f(x)dx$$` display → MathML `<math display="block">`
- Malformed LaTeX (`$\invalid{$`) → graceful fallback, no crash
- Math inside other markdown (e.g., bold text with inline math)

**Header shifting:**
- `# H1` in body → `<h2>` when header shift enabled
- `## H2` → `<h3>`, etc.
- `###### H6` stays `<h6>` (don't go past h6)

**Inline-only rendering:**
- `renderInline("**bold** text")` → `<strong>bold</strong> text` (no `<p>` wrapper)
- Block elements (headers, code blocks, lists) are NOT rendered in inline mode
- Links and inline code work in inline mode

**Security (critical):**
- Raw `<script>alert("xss")</script>` in input → escaped in output
- Raw `<img onerror=alert(1)>` → escaped
- `[link](javascript:alert(1))` → NOT rendered as clickable link
- HTML entities in code blocks are not double-escaped
- Markdown link with XSS in title: `[click](http://x "onmouseover=alert(1)")` → safe

**Edge cases:**
- Empty string → empty string
- Whitespace-only → empty or whitespace
- Very long code block (>10KB) → renders without timeout
- Nested markdown (bold inside italic inside list) → correct nesting
- Unicode content (CJK, emoji, RTL) → passes through correctly

### Integration tests: extend `src/__tests__/e2e.test.ts`

- **Post with markdown body**: verify rendered HTML contains `<strong>`, `<code>`, `<ul>`, etc.
- **Post with code block**: verify output contains syntax-highlighted spans (shiki output)
- **Post with math**: verify output contains `<math>` MathML elements
- **Micro with inline code**: verify `<code>` in output
- **Image caption with bold**: verify inline markdown rendered, no block elements
- **XSS test still passes**: existing `<script>alert("xss")</script>` test must continue to pass unchanged
- **RSS feed contains rendered HTML**: verify feed `<description>` has markdown-rendered content
- **JSON Feed contains rendered HTML**: verify `content_html` field

### Verify existing tests pass

All existing e2e tests must pass without modification (backwards compatible).
Markdown is a superset of plain text — passing plain text through markdown-it
produces `<p>`-wrapped text, which is the correct semantic upgrade from the
current `escHtml()` behavior.

## Rollout Risk

**Low.** Markdown is a superset of plain text. Existing content that was plain text
will now render as `<p>`-wrapped plain text — semantically correct and visually identical
(the stylesheet already styles `<p>` elements). No breaking change to existing sites.

The only behavioral difference: characters like `*`, `_`, `` ` ``, `#` that were previously
displayed literally will now be interpreted as markdown syntax. This is the desired behavior —
it's what users expect when writing content.
