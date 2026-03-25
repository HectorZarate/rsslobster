import type { OpmlOutline, Subscription } from "./types.js";
import { decodeXml } from "./parser.js";

/**
 * OPML import/export for RSS reader subscriptions.
 *
 * Supports:
 * - OPML 2.0 import (flat or folder-grouped outlines)
 * - OPML 2.0 export from subscriptions
 * - Preserves folder structure via <outline> nesting
 */

/** Parse an OPML document into a flat list of feed outlines */
export function parseOpml(xml: string): OpmlOutline[] {
  const body = extractBlock(xml, "body");
  if (body === undefined) throw new Error("OPML: missing <body>");

  return parseOutlines(body, undefined);
}

/** Generate OPML 2.0 XML from subscriptions */
export function generateOpml(
  title: string,
  subscriptions: Subscription[],
): string {
  // Group by folder
  const folders = new Map<string | undefined, Subscription[]>();
  for (const sub of subscriptions) {
    const key = sub.folder;
    const group = folders.get(key) ?? [];
    group.push(sub);
    folders.set(key, group);
  }

  const lines: string[] = [];

  // Unfiled subscriptions first
  const unfiled = folders.get(undefined) ?? [];
  for (const sub of unfiled) {
    lines.push(renderOutline(sub));
  }

  // Then folders
  for (const [folder, subs] of folders) {
    if (folder === undefined) continue;
    lines.push(`      <outline text="${escXml(folder)}" title="${escXml(folder)}">`);
    for (const sub of subs) {
      lines.push(`  ${renderOutline(sub)}`);
    }
    lines.push(`      </outline>`);
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<opml version="2.0">
  <head>
    <title>${escXml(title)}</title>
    <dateCreated>${new Date().toUTCString()}</dateCreated>
  </head>
  <body>
${lines.join("\n")}
  </body>
</opml>`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function renderOutline(sub: Subscription): string {
  const parts = [
    `type="rss"`,
    `text="${escXml(sub.title)}"`,
    `title="${escXml(sub.title)}"`,
    `xmlUrl="${escXml(sub.feedUrl)}"`,
  ];
  if (sub.siteUrl) {
    parts.push(`htmlUrl="${escXml(sub.siteUrl)}"`);
  }
  return `      <outline ${parts.join(" ")}/>`;
}

/** Recursively parse outlines, tracking parent folder */
function parseOutlines(
  xml: string,
  parentFolder: string | undefined,
): OpmlOutline[] {
  const results: OpmlOutline[] = [];

  // Match <outline ...> or <outline .../>
  const re = /<outline\s([^>]*?)(?:\/>|>([\s\S]*?)<\/outline>)/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1]!;
    const children = m[2]; // undefined for self-closing

    const xmlUrl = extractAttrValue(attrs, "xmlUrl");
    const title =
      extractAttrValue(attrs, "title") ??
      extractAttrValue(attrs, "text") ??
      "";
    const htmlUrl = extractAttrValue(attrs, "htmlUrl");

    if (xmlUrl) {
      // This is a feed outline
      results.push({
        title,
        xmlUrl,
        htmlUrl,
        folder: parentFolder,
      });
    } else if (children) {
      // This is a folder outline — recurse into children
      const folderName =
        extractAttrValue(attrs, "text") ??
        extractAttrValue(attrs, "title") ??
        "Unnamed";
      results.push(...parseOutlines(children, folderName));
    }
  }

  return results;
}

function extractAttrValue(
  attrs: string,
  name: string,
): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i");
  const m = re.exec(attrs);
  return m ? decodeXml(m[1]!) : undefined;
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


/** Extract block content between tags */
function extractBlock(xml: string, tag: string): string | undefined {
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`,
    "i",
  );
  const m = re.exec(xml);
  // Distinguish "tag not found" (undefined) from "tag found but empty" ("")
  return m === null ? undefined : m[1]!;
}
