import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { publishDueScheduled } from "./scheduler.js";
import { scaffoldSite } from "../generator/site.js";
import { createDraft, scheduleDraft } from "../drafts/drafts.js";
import type { SiteConfig, ClassifiedContent } from "../config/types.js";

describe("scheduled publisher", () => {
  let siteDir: string;
  const siteConfig: SiteConfig = {
    domain: "test.com",
    title: "Test Site",
    description: "A test",
    author: "Tester",
    language: "en",
    style: { preset: "minimal" },
    repo: "",
  };

  beforeEach(async () => {
    siteDir = await mkdtemp(join(tmpdir(), "rsslobster-scheduler-"));
    await scaffoldSite(siteDir, siteConfig);
  });

  afterEach(async () => {
    await rm(siteDir, { recursive: true, force: true });
  });

  function makeContent(slug: string): ClassifiedContent {
    const now = new Date().toISOString();
    return {
      type: "micro",
      body: `Content for ${slug}`,
      slug,
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  it("returns empty array when no scheduled drafts", async () => {
    const published = await publishDueScheduled(siteDir);
    expect(published).toEqual([]);
  });

  it("returns empty array when scheduled drafts are not yet due", async () => {
    await createDraft(siteDir, makeContent("future-post"));
    // Schedule 1 hour from now
    const futureDate = new Date(Date.now() + 3_600_000).toISOString();
    await scheduleDraft(siteDir, "future-post", futureDate);

    const published = await publishDueScheduled(siteDir);
    expect(published).toEqual([]);
  });

  it("publishes a single due draft", async () => {
    await createDraft(siteDir, makeContent("due-post"));
    // Schedule 1 second in the future, then mock time forward
    const pastDate = new Date(Date.now() - 1000).toISOString();
    // Directly write a scheduled draft with a past date (bypass validation)
    const draft = await createDraft(siteDir, makeContent("due-post-direct"));
    const draftPath = join(siteDir, "drafts", `${draft.slug}.json`);
    const draftData = JSON.parse(await readFile(draftPath, "utf-8"));
    draftData.status = "scheduled";
    draftData.scheduledAt = pastDate;
    const { writeFile: wf } = await import("node:fs/promises");
    await wf(draftPath, JSON.stringify(draftData, null, 2));

    const published = await publishDueScheduled(siteDir);
    expect(published).toHaveLength(1);
    expect(published[0]!.url).toContain("test.com");
    expect(published[0]!.slug).toBe(draft.slug);

    // HTML should exist
    const html = await readFile(
      join(siteDir, `${draft.slug}.html`),
      "utf-8",
    );
    expect(html).toContain(draft.body);

    // Draft should be marked as published
    const updatedDraft = JSON.parse(await readFile(draftPath, "utf-8"));
    expect(updatedDraft.status).toBe("published");
  });

  it("publishes multiple due drafts", async () => {
    const pastDate = new Date(Date.now() - 5000).toISOString();
    const { writeFile: wf } = await import("node:fs/promises");

    for (const slug of ["post-a", "post-b", "post-c"]) {
      const draft = await createDraft(siteDir, makeContent(slug));
      const path = join(siteDir, "drafts", `${draft.slug}.json`);
      const data = JSON.parse(await readFile(path, "utf-8"));
      data.status = "scheduled";
      data.scheduledAt = pastDate;
      await wf(path, JSON.stringify(data, null, 2));
    }

    const published = await publishDueScheduled(siteDir);
    expect(published).toHaveLength(3);

    // All should have URLs
    for (const post of published) {
      expect(post.url).toContain("test.com");
    }
  });

  it("does not republish already-published drafts", async () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const { writeFile: wf } = await import("node:fs/promises");

    const draft = await createDraft(siteDir, makeContent("once-only"));
    const path = join(siteDir, "drafts", `${draft.slug}.json`);
    const data = JSON.parse(await readFile(path, "utf-8"));
    data.status = "scheduled";
    data.scheduledAt = pastDate;
    await wf(path, JSON.stringify(data, null, 2));

    // First run publishes
    const first = await publishDueScheduled(siteDir);
    expect(first).toHaveLength(1);

    // Second run finds nothing due
    const second = await publishDueScheduled(siteDir);
    expect(second).toHaveLength(0);
  });

  it("continues publishing remaining drafts if one fails", async () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const { writeFile: wf } = await import("node:fs/promises");

    // Create two valid drafts
    for (const slug of ["good-a", "good-b"]) {
      const draft = await createDraft(siteDir, makeContent(slug));
      const path = join(siteDir, "drafts", `${draft.slug}.json`);
      const data = JSON.parse(await readFile(path, "utf-8"));
      data.status = "scheduled";
      data.scheduledAt = pastDate;
      await wf(path, JSON.stringify(data, null, 2));
    }

    // Create a corrupt draft file
    await wf(
      join(siteDir, "drafts", "corrupt.json"),
      '{"status":"scheduled","scheduledAt":"' + pastDate + '","slug":"corrupt"}',
    );

    // Should publish the good ones despite corrupt one
    const published = await publishDueScheduled(siteDir);
    expect(published.length).toBeGreaterThanOrEqual(2);
  });
});
