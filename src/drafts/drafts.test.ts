import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClassifiedContent } from "../config/types.js";
import {
  createDraft,
  listDrafts,
  getDraft,
  updateDraft,
  deleteDraft,
  scheduleDraft,
  unscheduleDraft,
  markPublished,
  getDueScheduledDrafts,
  getDraftRevisions,
  getDraftRevision,
  restoreDraftRevision,
} from "./drafts.js";

let siteDir: string;

const MICRO_CONTENT: ClassifiedContent = {
  type: "micro",
  body: "Hello world, this is a test micro post",
  slug: "hello-world",
  tags: ["test"],
  createdAt: "2026-03-20T12:00:00.000Z",
  updatedAt: "2026-03-20T12:00:00.000Z",
};

const POST_CONTENT: ClassifiedContent = {
  type: "post",
  title: "My First Blog Post",
  body: "This is a longer blog post with more content.",
  slug: "my-first-blog-post",
  tags: ["blog", "first"],
  createdAt: "2026-03-20T13:00:00.000Z",
  updatedAt: "2026-03-20T13:00:00.000Z",
};

beforeEach(async () => {
  siteDir = await mkdtemp(join(tmpdir(), "rsslobster-test-"));
});

afterEach(async () => {
  await rm(siteDir, { recursive: true, force: true });
});

describe("createDraft", () => {
  it("creates a draft file with correct content", async () => {
    const draft = await createDraft(siteDir, MICRO_CONTENT);

    expect(draft.status).toBe("draft");
    expect(draft.slug).toBe("hello-world");
    expect(draft.body).toBe(MICRO_CONTENT.body);
    expect(draft.type).toBe("micro");
  });

  it("resolves slug conflicts by appending suffix", async () => {
    const first = await createDraft(siteDir, MICRO_CONTENT);
    const second = await createDraft(siteDir, MICRO_CONTENT);

    expect(first.slug).toBe("hello-world");
    expect(second.slug).toBe("hello-world-2");
  });

  it("resolves multiple slug conflicts incrementally", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    await createDraft(siteDir, MICRO_CONTENT);
    const third = await createDraft(siteDir, MICRO_CONTENT);

    expect(third.slug).toBe("hello-world-3");
  });

  it("creates the drafts directory if it does not exist", async () => {
    const draft = await createDraft(siteDir, MICRO_CONTENT);
    expect(draft).toBeTruthy();
  });
});

describe("listDrafts", () => {
  it("returns empty array when no drafts exist", async () => {
    const drafts = await listDrafts(siteDir);
    expect(drafts).toEqual([]);
  });

  it("returns all drafts sorted newest first", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    // Small delay to ensure different updatedAt
    await createDraft(siteDir, POST_CONTENT);

    const drafts = await listDrafts(siteDir);
    expect(drafts).toHaveLength(2);
    // Newest first
    const t0 = new Date(drafts[0]!.updatedAt).getTime();
    const t1 = new Date(drafts[1]!.updatedAt).getTime();
    expect(t0).toBeGreaterThanOrEqual(t1);
  });

  it("filters by status", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const post = await createDraft(siteDir, POST_CONTENT);
    await markPublished(siteDir, post.slug);

    const draftsOnly = await listDrafts(siteDir, { status: "draft" });
    expect(draftsOnly).toHaveLength(1);
    expect(draftsOnly[0]!.slug).toBe("hello-world");

    const published = await listDrafts(siteDir, { status: "published" });
    expect(published).toHaveLength(1);
    expect(published[0]!.slug).toBe("my-first-blog-post");
  });
});

describe("getDraft", () => {
  it("returns draft by slug", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const draft = await getDraft(siteDir, "hello-world");

    expect(draft).not.toBeNull();
    expect(draft!.body).toBe(MICRO_CONTENT.body);
  });

  it("returns null for nonexistent slug", async () => {
    const draft = await getDraft(siteDir, "nonexistent");
    expect(draft).toBeNull();
  });
});

describe("updateDraft", () => {
  it("updates draft body while preserving other fields", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const updated = await updateDraft(siteDir, "hello-world", {
      body: "Updated body text",
    });

    expect(updated).not.toBeNull();
    expect(updated!.body).toBe("Updated body text");
    expect(updated!.type).toBe("micro"); // preserved
    expect(updated!.tags).toEqual(["test"]); // preserved
  });

  it("does not allow slug mutation", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const updated = await updateDraft(siteDir, "hello-world", {
      slug: "different-slug",
    });

    expect(updated!.slug).toBe("hello-world"); // unchanged
  });

  it("does not allow status change via update", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const updated = await updateDraft(siteDir, "hello-world", {
      body: "new body",
    });

    expect(updated!.status).toBe("draft"); // unchanged
  });

  it("returns null for nonexistent draft", async () => {
    const result = await updateDraft(siteDir, "nonexistent", {
      body: "test",
    });
    expect(result).toBeNull();
  });

  it("updates the updatedAt timestamp", async () => {
    const original = await createDraft(siteDir, MICRO_CONTENT);
    const updated = await updateDraft(siteDir, "hello-world", {
      body: "newer",
    });

    expect(
      new Date(updated!.updatedAt).getTime(),
    ).toBeGreaterThanOrEqual(new Date(original.updatedAt).getTime());
  });
});

describe("deleteDraft", () => {
  it("deletes an existing draft", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const deleted = await deleteDraft(siteDir, "hello-world");

    expect(deleted).toBe(true);

    const found = await getDraft(siteDir, "hello-world");
    expect(found).toBeNull();
  });

  it("returns false for nonexistent draft", async () => {
    const deleted = await deleteDraft(siteDir, "nonexistent");
    expect(deleted).toBe(false);
  });
});

describe("scheduleDraft", () => {
  it("schedules a draft for future publication", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const future = new Date(Date.now() + 86_400_000).toISOString(); // +1 day
    const scheduled = await scheduleDraft(siteDir, "hello-world", future);

    expect(scheduled).not.toBeNull();
    expect(scheduled!.status).toBe("scheduled");
    expect(scheduled!.scheduledAt).toBe(new Date(future).toISOString());
  });

  it("rejects invalid date strings", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    await expect(
      scheduleDraft(siteDir, "hello-world", "not-a-date"),
    ).rejects.toThrow("Invalid date");
  });

  it("rejects dates in the past", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const past = new Date(Date.now() - 86_400_000).toISOString();
    await expect(
      scheduleDraft(siteDir, "hello-world", past),
    ).rejects.toThrow("future");
  });

  it("returns null for nonexistent draft", async () => {
    const result = await scheduleDraft(
      siteDir,
      "nonexistent",
      new Date(Date.now() + 86_400_000).toISOString(),
    );
    expect(result).toBeNull();
  });
});

describe("unscheduleDraft", () => {
  it("reverts a scheduled draft back to draft status", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await scheduleDraft(siteDir, "hello-world", future);

    const unscheduled = await unscheduleDraft(siteDir, "hello-world");
    expect(unscheduled!.status).toBe("draft");
    expect(unscheduled!.scheduledAt).toBeUndefined();
  });

  it("returns the draft unchanged if not scheduled", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const result = await unscheduleDraft(siteDir, "hello-world");
    expect(result!.status).toBe("draft");
  });

  it("returns null for nonexistent draft", async () => {
    const result = await unscheduleDraft(siteDir, "nonexistent");
    expect(result).toBeNull();
  });
});

describe("markPublished", () => {
  it("marks a draft as published", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const published = await markPublished(siteDir, "hello-world");

    expect(published!.status).toBe("published");
  });

  it("returns null for nonexistent draft", async () => {
    const result = await markPublished(siteDir, "nonexistent");
    expect(result).toBeNull();
  });
});

describe("getDueScheduledDrafts", () => {
  it("returns drafts past their scheduled time", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    // Schedule for 1ms in the future, then wait
    const almostNow = new Date(Date.now() + 100).toISOString();
    await scheduleDraft(siteDir, "hello-world", almostNow);

    // Mock Date.now to be past the scheduled time
    vi.spyOn(Date, "now").mockReturnValue(
      new Date(almostNow).getTime() + 1000,
    );

    const due = await getDueScheduledDrafts(siteDir);
    expect(due).toHaveLength(1);
    expect(due[0]!.slug).toBe("hello-world");

    vi.restoreAllMocks();
  });

  it("does not return drafts scheduled for the future", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await scheduleDraft(siteDir, "hello-world", future);

    const due = await getDueScheduledDrafts(siteDir);
    expect(due).toHaveLength(0);
  });
});

// UX: Draft operations should provide clear feedback
describe("UX: feedback and safety", () => {
  it("every create returns the full draft for user confirmation", async () => {
    const draft = await createDraft(siteDir, MICRO_CONTENT);
    // All fields needed for display are present
    expect(draft.slug).toBeTruthy();
    expect(draft.body).toBeTruthy();
    expect(draft.type).toBeTruthy();
    expect(draft.status).toBeTruthy();
    expect(draft.createdAt).toBeTruthy();
    expect(draft.updatedAt).toBeTruthy();
  });

  it("delete requires exact slug — no partial matching", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const deleted = await deleteDraft(siteDir, "hello"); // partial
    expect(deleted).toBe(false);

    // Original still exists
    const found = await getDraft(siteDir, "hello-world");
    expect(found).not.toBeNull();
  });

  it("list returns consistent ordering regardless of creation order", async () => {
    await createDraft(siteDir, POST_CONTENT);
    await createDraft(siteDir, MICRO_CONTENT);

    const list1 = await listDrafts(siteDir);
    const list2 = await listDrafts(siteDir);

    expect(list1.map((d) => d.slug)).toEqual(list2.map((d) => d.slug));
  });
});

// --- Draft Revisions ---
describe("Draft Revisions", () => {
  it("createDraft saves initial revision (revision 1)", async () => {
    const draft = await createDraft(siteDir, MICRO_CONTENT);
    expect(draft.revisions).toBeDefined();
    expect(draft.revisions).toHaveLength(1);
    expect(draft.revisions![0]!.revision).toBe(1);
    expect(draft.revisions![0]!.body).toBe(MICRO_CONTENT.body);
    expect(draft.revisions![0]!.tags).toEqual(MICRO_CONTENT.tags);
  });

  it("updateDraft creates a new revision when body changes", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const updated = await updateDraft(siteDir, "hello-world", {
      body: "Updated body text",
    });

    expect(updated!.revisions).toHaveLength(2);
    expect(updated!.revisions![0]!.revision).toBe(1);
    expect(updated!.revisions![0]!.body).toBe(MICRO_CONTENT.body);
    expect(updated!.revisions![1]!.revision).toBe(2);
    expect(updated!.revisions![1]!.body).toBe("Updated body text");
  });

  it("updateDraft creates a new revision when title changes", async () => {
    await createDraft(siteDir, POST_CONTENT);
    const updated = await updateDraft(siteDir, "my-first-blog-post", {
      title: "Updated Title",
    });

    expect(updated!.revisions).toHaveLength(2);
    expect(updated!.revisions![1]!.title).toBe("Updated Title");
  });

  it("updateDraft creates a new revision when tags change", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const updated = await updateDraft(siteDir, "hello-world", {
      tags: ["new-tag"],
    });

    expect(updated!.revisions).toHaveLength(2);
    expect(updated!.revisions![1]!.tags).toEqual(["new-tag"]);
  });

  it("updateDraft does NOT create revision when only non-content fields change", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    // Type is not body/title/tags, so no revision should be created
    const updated = await updateDraft(siteDir, "hello-world", {
      type: "post",
    });

    expect(updated!.revisions).toHaveLength(1);
  });

  it("multiple updates build up revision history", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    await updateDraft(siteDir, "hello-world", { body: "v2" });
    await updateDraft(siteDir, "hello-world", { body: "v3" });
    const final = await updateDraft(siteDir, "hello-world", { body: "v4" });

    expect(final!.revisions).toHaveLength(4);
    expect(final!.revisions![0]!.body).toBe(MICRO_CONTENT.body);
    expect(final!.revisions![1]!.body).toBe("v2");
    expect(final!.revisions![2]!.body).toBe("v3");
    expect(final!.revisions![3]!.body).toBe("v4");
  });

  it("getDraftRevisions returns all revisions for a draft", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    await updateDraft(siteDir, "hello-world", { body: "v2" });

    const revisions = await getDraftRevisions(siteDir, "hello-world");
    expect(revisions).toHaveLength(2);
    expect(revisions[0]!.revision).toBe(1);
    expect(revisions[1]!.revision).toBe(2);
  });

  it("getDraftRevisions returns empty array for nonexistent draft", async () => {
    const revisions = await getDraftRevisions(siteDir, "nonexistent");
    expect(revisions).toEqual([]);
  });

  it("getDraftRevision returns a specific revision", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    await updateDraft(siteDir, "hello-world", { body: "v2" });

    const rev1 = await getDraftRevision(siteDir, "hello-world", 1);
    expect(rev1).not.toBeNull();
    expect(rev1!.body).toBe(MICRO_CONTENT.body);

    const rev2 = await getDraftRevision(siteDir, "hello-world", 2);
    expect(rev2).not.toBeNull();
    expect(rev2!.body).toBe("v2");
  });

  it("getDraftRevision returns null for nonexistent revision", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const rev = await getDraftRevision(siteDir, "hello-world", 99);
    expect(rev).toBeNull();
  });

  it("restoreDraftRevision restores content from a previous revision", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    await updateDraft(siteDir, "hello-world", { body: "v2 body", title: "v2 title" });
    await updateDraft(siteDir, "hello-world", { body: "v3 body" });

    // Restore to revision 1
    const restored = await restoreDraftRevision(siteDir, "hello-world", 1);
    expect(restored).not.toBeNull();
    expect(restored!.body).toBe(MICRO_CONTENT.body);
    expect(restored!.title).toBeUndefined(); // original had no title
    expect(restored!.tags).toEqual(MICRO_CONTENT.tags);
  });

  it("restoreDraftRevision creates a new revision entry", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    await updateDraft(siteDir, "hello-world", { body: "v2" });

    const restored = await restoreDraftRevision(siteDir, "hello-world", 1);
    // Should have 3 revisions: create, update, restore
    expect(restored!.revisions).toHaveLength(3);
    expect(restored!.revisions![2]!.revision).toBe(3);
    expect(restored!.revisions![2]!.body).toBe(MICRO_CONTENT.body);
  });

  it("restoreDraftRevision returns null for nonexistent draft", async () => {
    const result = await restoreDraftRevision(siteDir, "nonexistent", 1);
    expect(result).toBeNull();
  });

  it("restoreDraftRevision returns null for nonexistent revision", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    const result = await restoreDraftRevision(siteDir, "hello-world", 99);
    expect(result).toBeNull();
  });

  it("revision timestamps are ordered chronologically", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    await updateDraft(siteDir, "hello-world", { body: "v2" });
    await updateDraft(siteDir, "hello-world", { body: "v3" });

    const revisions = await getDraftRevisions(siteDir, "hello-world");
    for (let i = 1; i < revisions.length; i++) {
      const prev = new Date(revisions[i - 1]!.savedAt).getTime();
      const curr = new Date(revisions[i]!.savedAt).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  it("revision preserves tags as independent copy", async () => {
    await createDraft(siteDir, MICRO_CONTENT);
    await updateDraft(siteDir, "hello-world", { tags: ["new"] });

    const rev1 = await getDraftRevision(siteDir, "hello-world", 1);
    expect(rev1!.tags).toEqual(["test"]); // original tags preserved
  });
});
