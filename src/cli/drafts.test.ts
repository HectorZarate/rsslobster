import { describe, it, expect, beforeEach, vi } from "vitest";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { draftsCommand } from "./drafts.js";
import { scaffoldSite } from "../generator/site.js";
import type { SiteConfig } from "../config/types.js";

const SITE_CONFIG: SiteConfig = {
  domain: "example.com",
  title: "Test Blog",
  description: "A test blog",
  author: "Tester",
  language: "en",
  style: { preset: "minimal" },
  repo: "",
};

describe("drafts subcommands --site-dir flag", () => {
  let siteDir: string;

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-drafts-"));
    await scaffoldSite(siteDir, SITE_CONFIG);
  });

  it("drafts list accepts --site-dir flag and lists zero drafts", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    await draftsCommand.parseAsync([
      "node",
      "test",
      "list",
      "--site-dir",
      siteDir,
    ]);

    vi.restoreAllMocks();

    expect(logs).toHaveLength(1);
    const result = JSON.parse(logs[0]!);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("drafts list positional arg still works (backward compat)", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    await draftsCommand.parseAsync(["node", "test", "list", siteDir]);

    vi.restoreAllMocks();

    expect(logs).toHaveLength(1);
    const result = JSON.parse(logs[0]!);
    expect(Array.isArray(result)).toBe(true);
  });

  it("drafts publish-due accepts --site-dir flag", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    await draftsCommand.parseAsync([
      "node",
      "test",
      "publish-due",
      "--site-dir",
      siteDir,
    ]);

    vi.restoreAllMocks();

    expect(logs).toHaveLength(1);
    const result = JSON.parse(logs[0]!);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(0);
  });
});
