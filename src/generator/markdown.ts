import MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import { fromHighlighter } from "@shikijs/markdown-it";
import {
  createHighlighter,
  createCssVariablesTheme,
  type Highlighter,
} from "shiki";
import temml from "temml";

/**
 * Markdown rendering with syntax highlighting (shiki) and math (temml).
 *
 * Design:
 * - `initMarkdown()` is async (shiki grammar loading). Called once at startup.
 * - `renderMarkdown()` / `renderInline()` are synchronous after init.
 * - `html: false` — user HTML is escaped. Only parser-generated HTML passes through.
 * - Shiki uses CSS variables theme — colors inherit from site presets.
 * - Temml outputs native MathML — zero custom fonts, zero client JS.
 */

/** Languages to load eagerly. Covers >95% of blog code blocks. */
const CORE_LANGS = [
  "javascript",
  "typescript",
  "python",
  "rust",
  "go",
  "html",
  "css",
  "bash",
  "json",
  "sql",
  "c",
  "cpp",
  "java",
  "ruby",
  "php",
  "swift",
  "kotlin",
  "yaml",
  "toml",
  "markdown",
  "diff",
  "jsx",
  "tsx",
  "shell",
] as const;

let md: MarkdownIt;
let mdInline: MarkdownIt;
let highlighter: Highlighter;
let initPromise: Promise<void> | null = null;

/** Initialize the markdown rendering pipeline. Idempotent. */
export async function initMarkdown(): Promise<void> {
  if (md) return; // already initialized
  if (initPromise) return initPromise; // initialization in progress
  initPromise = doInit();
  return initPromise;
}

async function doInit(): Promise<void> {
  const theme = createCssVariablesTheme({
    name: "css-variables",
    variablePrefix: "--shiki-",
  });

  highlighter = await createHighlighter({
    themes: [theme],
    langs: [...CORE_LANGS],
  });

  // Full block + inline markdown (posts, micros)
  md = new MarkdownIt({ html: false, linkify: true, typographer: true });
  md.use(fromHighlighter(highlighter, { theme: "css-variables" }));
  md.use(mathPlugin);

  // Wrap the shiki highlight function to gracefully handle unknown languages
  const shikiHighlight = md.options.highlight!;
  md.options.highlight = (code, lang, attrs) => {
    try {
      return shikiHighlight(code, lang, attrs);
    } catch {
      // Unknown language — fall back to plain <pre><code>
      const escaped = code
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<pre><code>${escaped}</code></pre>`;
    }
  };

  // Inline-only markdown (captions): no block rules, no math blocks
  mdInline = new MarkdownIt({ html: false, linkify: true, typographer: true });
  mdInline.use(inlineMathPlugin);
}

/**
 * Render full block-level markdown.
 * @param body - raw markdown text
 * @param shiftHeadings - if true, remap h1→h2, h2→h3, etc. (for posts with titles)
 */
export function renderMarkdown(body: string, shiftHeadings = false): string {
  if (!md) throw new Error("initMarkdown() must be called before rendering");
  if (!body) return "";

  if (shiftHeadings) {
    // Temporarily install heading shift rule
    const origOpen = md.renderer.rules["heading_open"];
    const origClose = md.renderer.rules["heading_close"];
    md.renderer.rules["heading_open"] = (tokens, idx, options, env, self) => {
      shiftHeadingToken(tokens[idx]!);
      return (origOpen ?? self.renderToken.bind(self))(
        tokens,
        idx,
        options,
        env,
        self,
      );
    };
    md.renderer.rules["heading_close"] = (tokens, idx, options, env, self) => {
      shiftHeadingToken(tokens[idx]!);
      return (origClose ?? self.renderToken.bind(self))(
        tokens,
        idx,
        options,
        env,
        self,
      );
    };

    const result = md.render(body);

    // Restore
    md.renderer.rules["heading_open"] = origOpen;
    md.renderer.rules["heading_close"] = origClose;
    return result;
  }

  return md.render(body);
}

/**
 * Render inline-only markdown (for captions).
 * No block elements — just bold, italic, code, links, inline math.
 */
export function renderInline(body: string): string {
  if (!mdInline)
    throw new Error("initMarkdown() must be called before rendering");
  if (!body) return "";
  return mdInline.renderInline(body);
}

/**
 * Dispose the shiki highlighter to free memory.
 * Call on shutdown if needed.
 */
export function disposeMarkdown(): void {
  highlighter?.dispose();
}

// ---------------------------------------------------------------------------
// Heading shift: h1→h2, h2→h3, ..., h5→h6. h6 stays h6.
// ---------------------------------------------------------------------------

function shiftHeadingToken(token: { tag: string }): void {
  const match = /^h([1-5])$/.exec(token.tag);
  if (match) {
    token.tag = `h${Number(match[1]) + 1}`;
  }
}

// ---------------------------------------------------------------------------
// Math plugin for markdown-it: $...$ inline, $$...$$ display
// ---------------------------------------------------------------------------

/** Full math plugin: inline $...$ and display $$...$$ */
function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.after("escape", "math_inline", mathInlineRule);
  md.block.ruler.before("fence", "math_block", mathBlockRule, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  md.renderer.rules["math_inline"] = renderMathInline;
  md.renderer.rules["math_block"] = renderMathBlock;
}

/** Inline-only math plugin: just $...$ */
function inlineMathPlugin(md: MarkdownIt): void {
  md.inline.ruler.after("escape", "math_inline", mathInlineRule);
  md.renderer.rules["math_inline"] = renderMathInline;
}

/** Parse inline math: $...$  (not $$, not $5 dollar amounts) */
function mathInlineRule(state: StateInline, silent: boolean): boolean {
  if (state.src.charCodeAt(state.pos) !== 0x24 /* $ */) return false;
  // Not display math ($$)
  if (state.src.charCodeAt(state.pos + 1) === 0x24) return false;
  // Not a dollar amount ($5, $10, etc.)
  const nextChar = state.src.charCodeAt(state.pos + 1);
  if (nextChar >= 0x30 && nextChar <= 0x39) return false; // 0-9

  const start = state.pos + 1;
  let end = start;
  while (end < state.posMax) {
    if (
      state.src.charCodeAt(end) === 0x24 &&
      state.src.charCodeAt(end - 1) !== 0x5c /* \ */
    ) {
      break;
    }
    end++;
  }
  if (end >= state.posMax) return false; // no closing $

  const content = state.src.slice(start, end).trim();
  if (!content) return false;

  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.content = content;
    token.markup = "$";
  }
  state.pos = end + 1;
  return true;
}

/** Parse display math block: $$ ... $$ */
function mathBlockRule(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean {
  const startPos = state.bMarks[startLine]! + state.tShift[startLine]!;
  const maxPos = state.eMarks[startLine]!;

  if (startPos + 2 > maxPos) return false;
  if (
    state.src.charCodeAt(startPos) !== 0x24 ||
    state.src.charCodeAt(startPos + 1) !== 0x24
  ) {
    return false;
  }

  // Check if closing $$ is on the same line
  const firstLineContent = state.src.slice(startPos + 2, maxPos).trim();
  if (firstLineContent.endsWith("$$")) {
    // Single-line: $$ content $$
    if (silent) return true;
    const token = state.push("math_block", "math", 0);
    token.content = firstLineContent.slice(0, -2).trim();
    token.markup = "$$";
    token.map = [startLine, startLine + 1];
    state.line = startLine + 1;
    return true;
  }

  // Multi-line: find closing $$
  let nextLine = startLine + 1;
  while (nextLine < endLine) {
    const lineStart = state.bMarks[nextLine]! + state.tShift[nextLine]!;
    const lineEnd = state.eMarks[nextLine]!;
    const lineText = state.src.slice(lineStart, lineEnd).trim();
    if (lineText === "$$") {
      break;
    }
    nextLine++;
  }
  if (nextLine >= endLine) return false; // no closing $$

  if (silent) return true;

  const token = state.push("math_block", "math", 0);
  token.content = state
    .getLines(startLine + 1, nextLine, state.tShift[startLine + 1]!, false)
    .trim();
  // If first line had content after $$, prepend it
  if (firstLineContent) {
    token.content = firstLineContent + "\n" + token.content;
  }
  token.markup = "$$";
  token.map = [startLine, nextLine + 1];
  state.line = nextLine + 1;
  return true;
}

/** Render inline math token to MathML */
function renderMathInline(
  tokens: { content: string }[],
  idx: number,
): string {
  try {
    return temml.renderToString(tokens[idx]!.content, {
      displayMode: false,
      throwOnError: false,
    });
  } catch {
    return `<code>${escMathFallback(tokens[idx]!.content)}</code>`;
  }
}

/** Render display math token to MathML */
function renderMathBlock(tokens: { content: string }[], idx: number): string {
  try {
    return temml.renderToString(tokens[idx]!.content, {
      displayMode: true,
      throwOnError: false,
    });
  } catch {
    return `<pre><code>${escMathFallback(tokens[idx]!.content)}</code></pre>`;
  }
}

/** Escape HTML in math fallback rendering */
function escMathFallback(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
