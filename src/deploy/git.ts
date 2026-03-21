import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ContentType } from "../config/types.js";

const exec = promisify(execFile);

export interface GitStatus {
  clean: boolean;
  files: string[];
}

export interface DeployResult {
  committed: boolean;
  hash?: string;
  pushError?: string;
}

/** Check working tree status. O(n) in changed files, not repo size. */
export async function gitStatus(siteDir: string): Promise<GitStatus> {
  const { stdout } = await exec("git", ["status", "--porcelain"], {
    cwd: siteDir,
  });
  const files = stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.slice(3));
  return { clean: files.length === 0, files };
}

/** Stage files. Defaults to all changes when no paths given. */
export async function gitAdd(
  siteDir: string,
  paths?: string[],
): Promise<void> {
  const args = paths && paths.length > 0 ? ["add", ...paths] : ["add", "-A"];
  await exec("git", args, { cwd: siteDir });
}

/** Commit staged changes. Returns short hash. */
export async function gitCommit(
  siteDir: string,
  message: string,
): Promise<string> {
  await exec("git", ["commit", "-m", message], { cwd: siteDir });
  const { stdout } = await exec("git", ["rev-parse", "--short", "HEAD"], {
    cwd: siteDir,
  });
  return stdout.trim();
}

/** Push to tracked remote. */
export async function gitPush(siteDir: string): Promise<void> {
  await exec("git", ["push"], { cwd: siteDir });
}

/** Full deploy: stage all, commit, push. Returns result without throwing on push failure. */
export async function deployToGit(
  siteDir: string,
  contentType: ContentType,
  slug: string,
): Promise<DeployResult> {
  const status = await gitStatus(siteDir);
  if (status.clean) {
    return { committed: false };
  }

  await gitAdd(siteDir);
  const message = `publish: ${contentType} — ${slug}`;
  const hash = await gitCommit(siteDir, message);

  try {
    await gitPush(siteDir);
  } catch (err) {
    const pushError =
      err instanceof Error ? err.message : "Unknown push error";
    return { committed: true, hash, pushError };
  }

  return { committed: true, hash };
}
