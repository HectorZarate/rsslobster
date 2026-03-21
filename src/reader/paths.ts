import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const READER_DIR = "reader";

export function readerDir(siteDir: string): string {
  return join(siteDir, READER_DIR);
}

export async function ensureReaderDir(siteDir: string): Promise<void> {
  await mkdir(readerDir(siteDir), { recursive: true });
}

/** Content-addressable hash: SHA-256 of title|content, truncated to 16 hex chars. */
export function contentHash(title: string, content: string): string {
  return createHash("sha256")
    .update(title + "|" + content)
    .digest("hex")
    .slice(0, 16);
}
