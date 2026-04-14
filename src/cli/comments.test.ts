import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { commentsCommand } from "./comments.js";

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
const strip = (s: string) => s.replace(ANSI_RE, "");

let siteDir: string;

beforeEach(async () => {
  siteDir = await mkdtemp(join(tmpdir(), "rsslobster-comments-test-"));
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

  it("has all subcommands", () => {
    const names = commentsCommand.commands.map((c) => c.name());
    expect(names).toContain("list");
    expect(names).toContain("approve");
    expect(names).toContain("reject");
    expect(names).toContain("spam");
    expect(names).toContain("unapprove");
    expect(names).toContain("delete");
    expect(names).toContain("approve-all");
    expect(names).toContain("mode");
    expect(names).toContain("ban");
    expect(names).toContain("unban");
    expect(names).toContain("bans");
    expect(names).toContain("dashboard");
  });
});

describe("comments dashboard subcommand", () => {
  it("prints a clickable admin dashboard URL with auth token", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });

    const dashboard = commentsCommand.commands.find((c) => c.name() === "dashboard")!;
    await dashboard.parseAsync(["node", "test", "--site-dir", siteDir]);

    const output = strip(logs.join("\n"));
    expect(output).toContain(
      "https://comments.example.com/admin/dashboard?token=test-secret-123",
    );
  });

  it("errors when admin secret is missing", async () => {
    await writeFile(
      join(siteDir, "lobster.json"),
      JSON.stringify({}),
    );

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit");
    });

    const dashboard = commentsCommand.commands.find((c) => c.name() === "dashboard")!;
    await expect(
      dashboard.parseAsync(["node", "test", "--site-dir", siteDir]),
    ).rejects.toThrow("process.exit");
  });
});

describe("comments dashboard (no subcommand)", () => {
  it("calls /admin/stats and /admin/mode", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ pending: 3, approved: 10, rejected: 1, spam: 2 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ mode: "on" }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});

    await commentsCommand.parseAsync(["node", "test", "--site-dir", siteDir]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const urls = mockFetch.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(urls).toContain("https://comments.example.com/admin/stats");
    expect(urls).toContain("https://comments.example.com/admin/mode");
  });

  it("displays stats and mode", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ pending: 3, approved: 10, rejected: 1, spam: 2 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ mode: "paused" }), { status: 200 })));

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => { logs.push(args.join(" ")); });

    await commentsCommand.parseAsync(["node", "test", "--site-dir", siteDir]);

    const output = strip(logs.join("\n"));
    expect(output).toContain("pending");
    expect(output).toContain("3");
    expect(output).toContain("approved");
    expect(output).toContain("10");
    expect(output).toContain("paused");
  });
});

describe("comments list", () => {
  it("calls GET /admin/comments with default status=pending when no slug", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const list = commentsCommand.commands.find((c) => c.name() === "list")!;
    await list.parseAsync(["node", "test", "--site-dir", siteDir]);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/admin/comments?status=pending"),
      expect.any(Object),
    );
  });

  it("passes slug and status filters", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const list = commentsCommand.commands.find((c) => c.name() === "list")!;
    await list.parseAsync(["node", "test", "my-post", "--status", "approved", "--site-dir", siteDir]);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("slug=my-post");
    expect(url).toContain("status=approved");
  });

  it("passes author and limit filters", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const list = commentsCommand.commands.find((c) => c.name() === "list")!;
    await list.parseAsync(["node", "test", "--author", "Ada", "-n", "5", "--site-dir", siteDir]);

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("author=Ada");
    expect(url).toContain("limit=5");
  });

  it("displays comment info in output", async () => {
    const mockComments = [
      { id: "1", author: "Ada", body: "Hello world", createdAt: "2026-03-25T12:00:00Z", slug: "test", status: "pending" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockComments), { status: 200 }),
    ));

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => { logs.push(args.join(" ")); });

    const list = commentsCommand.commands.find((c) => c.name() === "list")!;
    await list.parseAsync(["node", "test", "test", "--status", "pending", "--site-dir", siteDir]);

    const output = logs.join("\n");
    expect(output).toContain("Ada");
  });

  it("handles empty response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("[]", { status: 200 }),
    ));

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => { logs.push(args.join(" ")); });

    const list = commentsCommand.commands.find((c) => c.name() === "list")!;
    await list.parseAsync(["node", "test", "--site-dir", siteDir]);

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
    vi.spyOn(console, "log").mockImplementation((...args) => { logs.push(args.join(" ")); });

    const approve = commentsCommand.commands.find((c) => c.name() === "approve")!;
    await approve.parseAsync(["node", "test", "abc123", "--site-dir", siteDir]);

    const output = strip(logs.join("\n"));
    expect(output).toMatch(/approved/i);
  });

  it("passes AbortSignal for timeout", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const approve = commentsCommand.commands.find((c) => c.name() === "approve")!;
    await approve.parseAsync(["node", "test", "abc123", "--site-dir", siteDir]);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
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
    vi.spyOn(console, "log").mockImplementation((...args) => { logs.push(args.join(" ")); });

    const reject = commentsCommand.commands.find((c) => c.name() === "reject")!;
    await reject.parseAsync(["node", "test", "abc123", "--site-dir", siteDir]);

    const output = strip(logs.join("\n"));
    expect(output).toMatch(/rejected/i);
  });
});

describe("comments spam", () => {
  it("calls POST /spam/:id on the Worker endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const spam = commentsCommand.commands.find((c) => c.name() === "spam")!;
    await spam.parseAsync(["node", "test", "abc123", "--site-dir", siteDir]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://comments.example.com/spam/abc123",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("comments unapprove", () => {
  it("calls POST /unapprove/:id on the Worker endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const unapprove = commentsCommand.commands.find((c) => c.name() === "unapprove")!;
    await unapprove.parseAsync(["node", "test", "abc123", "--site-dir", siteDir]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://comments.example.com/unapprove/abc123",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("comments delete", () => {
  it("calls DELETE /comments/:id on the Worker endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const del = commentsCommand.commands.find((c) => c.name() === "delete")!;
    await del.parseAsync(["node", "test", "abc123", "--site-dir", siteDir]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://comments.example.com/comments/abc123",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("comments approve-all", () => {
  it("calls POST /admin/bulk/approve with slug in body", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ count: 5 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const approveAll = commentsCommand.commands.find((c) => c.name() === "approve-all")!;
    await approveAll.parseAsync(["node", "test", "my-post", "--site-dir", siteDir]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://comments.example.com/admin/bulk/approve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ slug: "my-post" }),
      }),
    );
  });
});

describe("comments mode", () => {
  it("calls POST /admin/mode when setting a value", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const mode = commentsCommand.commands.find((c) => c.name() === "mode")!;
    await mode.parseAsync(["node", "test", "paused", "--site-dir", siteDir]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://comments.example.com/admin/mode",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ mode: "paused" }),
      }),
    );
  });

  it("calls GET /admin/mode when no value given", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ mode: "on" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const mode = commentsCommand.commands.find((c) => c.name() === "mode")!;
    await mode.parseAsync(["node", "test", "--site-dir", siteDir]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://comments.example.com/admin/mode",
      expect.objectContaining({ method: "GET" }),
    );
  });
});

describe("comments ban", () => {
  it("calls POST /admin/ban with ip_hash and reason", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const ban = commentsCommand.commands.find((c) => c.name() === "ban")!;
    await ban.parseAsync(["node", "test", "abc123def456", "--reason", "spam", "--site-dir", siteDir]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://comments.example.com/admin/ban",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ip_hash: "abc123def456", reason: "spam" }),
      }),
    );
  });
});

describe("comments unban", () => {
  it("calls DELETE /admin/ban/:ip_hash", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(console, "log").mockImplementation(() => {});

    const unban = commentsCommand.commands.find((c) => c.name() === "unban")!;
    await unban.parseAsync(["node", "test", "abc123def456", "--site-dir", siteDir]);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://comments.example.com/admin/ban/abc123def456",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("comments bans", () => {
  it("calls GET /admin/bans and displays results", async () => {
    const mockBans = [
      { ip_hash: "abc123", reason: "spammer", banned_at: "2026-04-01T12:00:00Z" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockBans), { status: 200 }),
    ));

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => { logs.push(args.join(" ")); });

    const bans = commentsCommand.commands.find((c) => c.name() === "bans")!;
    await bans.parseAsync(["node", "test", "--site-dir", siteDir]);

    const output = logs.join("\n");
    expect(output).toContain("abc123");
    expect(output).toContain("spammer");
  });

  it("handles empty bans list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("[]", { status: 200 }),
    ));

    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args) => { logs.push(args.join(" ")); });

    const bans = commentsCommand.commands.find((c) => c.name() === "bans")!;
    await bans.parseAsync(["node", "test", "--site-dir", siteDir]);

    const output = logs.join("\n");
    expect(output).toMatch(/no banned/i);
  });
});
