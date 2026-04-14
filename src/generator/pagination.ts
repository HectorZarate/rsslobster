import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { Comment } from "ziscus";

export const DEFAULT_COMMENTS_PER_PAGE = 200;

export function paginateComments(
  comments: Comment[],
  pageSize: number = DEFAULT_COMMENTS_PER_PAGE,
): Comment[][] {
  if (comments.length === 0) return [[]];
  const pages: Comment[][] = [];
  for (let i = 0; i < comments.length; i += pageSize) {
    pages.push(comments.slice(i, i + pageSize));
  }
  return pages;
}

export function commentPageUrl(baseUrl: string, pageNum: number): string {
  if (pageNum === 1) return baseUrl;
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}${pageNum}/`;
}

export async function cleanStaleCommentPages(
  outDir: string,
  permalinkDirPath: string,
  currentPageCount: number,
): Promise<void> {
  const slugDir = join(outDir, permalinkDirPath);
  let entries: string[];
  try {
    entries = await readdir(slugDir);
  } catch {
    return;
  }
  const removals = entries
    .filter((name) => /^\d+$/.test(name) && parseInt(name, 10) > currentPageCount)
    .map((name) => rm(join(slugDir, name), { recursive: true, force: true }));
  await Promise.all(removals);
}
