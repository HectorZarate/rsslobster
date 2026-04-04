import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commentsCommand } from "./comments.js";

let siteDir: string;

beforeEach(async () => {
  siteDir = await mkdtemp(join(tmpdir(), "rsslobster-comments-test-"));
  // Write rsslobster.json with commentsEndpoint
  await writeFile(
    join(siteDir, "rsslobster.json"),
    JSON.stringify({
      domain: "example.com",
      title: "Test",
      description: "Test",
      author: "Tester",
      language: "en",
      style: { preset: "minimal" },
      repo: "",
      commentsEndpoint: "https://comments.example.com",
    }),
  );
  // Write lobster.json with admin secret
  await writeFile(
    join(siteDir, "lobster.json"),
    JSON.stringify({ commentsAdminSecret: "test-secret-123" }),
  );
});

afterEach(async () => {
  await rm(siteDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("commentsCommand", () => {
  it("is named 'comments'", () => {
    expect(commentsCommand.name()).toBe("comments");
  });

  it("has subcommands: list, approve, reject", () => {
    const names = commentsCommand.commands.map((c) => c.name());
    expect(names).toContain("list");
    expect(names).toContain("approve");
    expect(names).toContain("reject");
  });
});

describe("comments list", () => {
  it("calls GET /comments/:slug on the Worker endpoint", async () => {
    const mockComments = [
      { id: "1", author: "Ada", body: "Hello", createdAt: "2026-03-25T12:00:00Z", slug: "test", status: "approved" },
    ];
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockComments), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const list = commentsCommand.commands.find((c) => c.name() === "list")!;
    await list.parseAsync(["node", "test", "test", "--site-dir", siteDir]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://comments.example.com/comments/test",
      expect.any(Object),
    );
  });

  it("displays comment info in output", async () => {
    const mockComments = [
      { id: "1", author: "Ada", body: "Hello world", createdAt: "2026-03-25T12:00:00Z", slug: "test", status: "approved" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockComments), { status: 200 }),
    ));

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const list = commentsCommand.commands.find((c) => c.name() === "list")!;
    await list.parseAsync(["node", "test", "test", "--site-dir", siteDir]);

    const output = logs.join("\n");
    expect(output).toContain("Ada");
  });

  it("handles empty response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("[]", { status: 200 }),
    ));

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const list = commentsCommand.commands.find((c) => c.name() === "list")!;
    await list.parseAsync(["node", "test", "test", "--site-dir", siteDir]);

    const output = logs.join("\n");
    expect(output).toMatch(/no comments/i);
  });
});

describe("comments approve", () => {
  it("calls POST /approve/:id on the Worker endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const approve = commentsCommand.commands.find((c) => c.name() === "approve")!;
    await approve.parseAsync(["node", "test", "abc123", "--site-dir", siteDir]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://comments.example.com/approve/abc123",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-secret-123",
        }),
      }),
    );
  });

  it("outputs success message on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ));

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const approve = commentsCommand.commands.find((c) => c.name() === "approve")!;
    await approve.parseAsync(["node", "test", "abc123", "--site-dir", siteDir]);

    const output = logs.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    expect(output).toMatch(/approved/i);
  });
});

describe("comments reject", () => {
  it("calls POST /reject/:id on the Worker endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const reject = commentsCommand.commands.find((c) => c.name() === "reject")!;
    await reject.parseAsync(["node", "test", "abc123", "--site-dir", siteDir]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://comments.example.com/reject/abc123",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-secret-123",
        }),
      }),
    );
  });

  it("outputs success message on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ));

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const reject = commentsCommand.commands.find((c) => c.name() === "reject")!;
    await reject.parseAsync(["node", "test", "abc123", "--site-dir", siteDir]);

    const output = logs.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
    expect(output).toMatch(/rejected/i);
  });
});
