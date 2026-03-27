import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { readSiteConfig } from "../generator/site.js";
import type { SiteConfig } from "./types.js";

/** Resolve the registry directory dynamically (respects HOME changes in tests) */
function registryDir(): string {
  return join(process.env.HOME ?? homedir(), ".rsslobster");
}

/** A registered site in the workspace */
export interface SiteEntry {
  /** Short alias (e.g., "blog", "photo", "personal") */
  name: string;
  /** Absolute path to the site directory */
  path: string;
  /** Cached domain from rsslobster.json */
  domain: string;
}

/** Global workspace registry */
export interface Workspace {
  /** Name of the default site */
  defaultSite?: string;
  /** All registered sites */
  sites: SiteEntry[];
}

/** Resolved target site ready for operations */
export interface ResolvedSite {
  siteDir: string;
  config: SiteConfig;
}

/** Path to the workspace registry */
export function registryPath(): string {
  return join(registryDir(), "sites.json");
}

/** Read the workspace registry. Returns empty workspace if file doesn't exist. */
export async function readWorkspace(): Promise<Workspace> {
  try {
    const raw = await readFile(registryPath(), "utf-8");
    return JSON.parse(raw) as Workspace;
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return { sites: [] };
    }
    throw err;
  }
}

/** Write the workspace registry atomically. */
async function writeWorkspace(workspace: Workspace): Promise<void> {
  await mkdir(registryDir(), { recursive: true });
  await writeFile(registryPath(), JSON.stringify(workspace, null, 2) + "\n");
}

/** Register a site in the workspace. */
export async function addSite(
  name: string,
  sitePath: string,
): Promise<SiteEntry> {
  const absPath = resolve(sitePath);

  // Validate: must have rsslobster.json
  let config: SiteConfig;
  try {
    config = await readSiteConfig(absPath);
  } catch {
    throw new Error(
      `Not a valid rsslobster site: ${absPath} (no rsslobster.json found)`,
    );
  }

  const workspace = await readWorkspace();

  // Check for duplicate name
  const existing = workspace.sites.find((s) => s.name === name);
  if (existing) {
    throw new Error(
      `Site "${name}" already registered at ${existing.path}. Use "sites remove ${name}" first.`,
    );
  }

  const entry: SiteEntry = {
    name,
    path: absPath,
    domain: config.domain,
  };

  workspace.sites.push(entry);

  // If this is the first site, make it the default
  if (workspace.sites.length === 1) {
    workspace.defaultSite = name;
  }

  await writeWorkspace(workspace);
  return entry;
}

/** Remove a site from the workspace. */
export async function removeSite(name: string): Promise<void> {
  const workspace = await readWorkspace();
  const idx = workspace.sites.findIndex((s) => s.name === name);
  if (idx === -1) {
    throw new Error(`Site "${name}" not found in registry.`);
  }
  workspace.sites.splice(idx, 1);

  // Clear default if it was the removed site
  if (workspace.defaultSite === name) {
    workspace.defaultSite =
      workspace.sites.length > 0 ? workspace.sites[0]!.name : undefined;
  }

  await writeWorkspace(workspace);
}

/** Set the default site. */
export async function setDefault(name: string): Promise<void> {
  const workspace = await readWorkspace();
  const entry = workspace.sites.find((s) => s.name === name);
  if (!entry) {
    throw new Error(`Site "${name}" not found in registry.`);
  }
  workspace.defaultSite = name;
  await writeWorkspace(workspace);
}

/** List all registered sites. */
export async function listSites(): Promise<SiteEntry[]> {
  const workspace = await readWorkspace();
  return workspace.sites;
}

/**
 * Resolve a site name or path to an absolute site directory.
 * Tries in order: registered name → absolute/relative path.
 */
export async function resolveSite(nameOrPath: string): Promise<string> {
  const workspace = await readWorkspace();
  const entry = workspace.sites.find((s) => s.name === nameOrPath);
  if (entry) return entry.path;

  // Fall back to treating it as a path
  const absPath = resolve(nameOrPath);
  try {
    await readSiteConfig(absPath);
    return absPath;
  } catch {
    throw new Error(
      `"${nameOrPath}" is not a registered site name or a valid site directory.`,
    );
  }
}

/**
 * Resolve a --to target into a site directory and loaded config.
 * Shared helper used by feeds share and publish.
 */
export async function resolveTargetSite(
  nameOrPath: string,
): Promise<ResolvedSite> {
  const siteDir = await resolveSite(nameOrPath);
  const config = await readSiteConfig(siteDir);
  return { siteDir, config };
}
