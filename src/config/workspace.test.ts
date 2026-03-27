import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readWorkspace,
  addSite,
  removeSite,
  setDefault,
  listSites,
  resolveSite,
  resolveTargetSite,
} from "./workspace.js";

describe("workspace registry", () => {
  let tmpDir: string;
  let siteA: string;
  let siteB: string;
  let origHome: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "rsslobster-workspace-"));
    siteA = join(tmpDir, "site-a");
    siteB = join(tmpDir, "site-b");

    // Create two test sites with rsslobster.json
    const { mkdir } = await import("node:fs/promises");
    await mkdir(siteA, { recursive: true });
    await mkdir(siteB, { recursive: true });

    await writeFile(
      join(siteA, "rsslobster.json"),
      JSON.stringify({
        domain: "blog.example.com",
        title: "Blog",
        description: "Test blog",
        author: "Tester",
        language: "en",
        style: { preset: "minimal" },
        repo: "",
      }),
    );

    await writeFile(
      join(siteB, "rsslobster.json"),
      JSON.stringify({
        domain: "photo.example.com",
        title: "Photos",
        description: "Test photos",
        author: "Tester",
        language: "en",
        style: { preset: "minimal" },
        repo: "",
      }),
    );

    // Point HOME to tmpDir so registry goes to tmpDir/.rsslobster/
    origHome = process.env.HOME!;
    process.env.HOME = tmpDir;
  });

  afterEach(async () => {
    process.env.HOME = origHome;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty workspace when no registry exists", async () => {
    const ws = await readWorkspace();
    expect(ws.sites).toEqual([]);
  });

  it("adds a site to the registry", async () => {
    const entry = await addSite("blog", siteA);
    expect(entry.name).toBe("blog");
    expect(entry.domain).toBe("blog.example.com");
    expect(entry.path).toBe(siteA);
  });

  it("persists sites across reads", async () => {
    await addSite("blog", siteA);
    const sites = await listSites();
    expect(sites).toHaveLength(1);
    expect(sites[0]!.name).toBe("blog");
  });

  it("first site becomes default", async () => {
    await addSite("blog", siteA);
    const ws = await readWorkspace();
    expect(ws.defaultSite).toBe("blog");
  });

  it("rejects duplicate names", async () => {
    await addSite("blog", siteA);
    await expect(addSite("blog", siteB)).rejects.toThrow("already registered");
  });

  it("rejects invalid site path", async () => {
    await expect(addSite("nope", join(tmpDir, "nonexistent"))).rejects.toThrow(
      "Not a valid rsslobster site",
    );
  });

  it("removes a site", async () => {
    await addSite("blog", siteA);
    await addSite("photo", siteB);
    await removeSite("blog");
    const sites = await listSites();
    expect(sites).toHaveLength(1);
    expect(sites[0]!.name).toBe("photo");
  });

  it("updates default when removing the default site", async () => {
    await addSite("blog", siteA);
    await addSite("photo", siteB);
    await removeSite("blog");
    const ws = await readWorkspace();
    expect(ws.defaultSite).toBe("photo");
  });

  it("rejects removing unknown site", async () => {
    await expect(removeSite("nope")).rejects.toThrow("not found");
  });

  it("sets default site", async () => {
    await addSite("blog", siteA);
    await addSite("photo", siteB);
    await setDefault("photo");
    const ws = await readWorkspace();
    expect(ws.defaultSite).toBe("photo");
  });

  it("rejects setting unknown site as default", async () => {
    await expect(setDefault("nope")).rejects.toThrow("not found");
  });

  it("resolves site by name", async () => {
    await addSite("blog", siteA);
    const resolved = await resolveSite("blog");
    expect(resolved).toBe(siteA);
  });

  it("resolves site by absolute path", async () => {
    const resolved = await resolveSite(siteA);
    expect(resolved).toBe(siteA);
  });

  it("rejects unknown name and invalid path", async () => {
    await expect(resolveSite("nope")).rejects.toThrow(
      "not a registered site name",
    );
  });

  it("resolveTargetSite returns siteDir and config", async () => {
    await addSite("photo", siteB);
    const resolved = await resolveTargetSite("photo");
    expect(resolved.siteDir).toBe(siteB);
    expect(resolved.config.domain).toBe("photo.example.com");
  });
});
