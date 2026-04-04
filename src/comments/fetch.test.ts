import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchComments } from "./fetch.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchComments", () => {
  it("fetches comments from the endpoint for a given slug", async () => {
    const mockComments = [
      { id: "1", author: "Ada", body: "Great post", createdAt: "2026-03-25T12:00:00Z", slug: "test", status: "approved" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(mockComments), { status: 200 })));

    const result = await fetchComments("test", "https://comments.example.com");
    expect(result).toEqual(mockComments);
    expect(fetch).toHaveBeenCalledWith(
      "https://comments.example.com/comments/test",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("returns empty array on 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 })));

    const result = await fetchComments("nonexistent", "https://comments.example.com");
    expect(result).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const result = await fetchComments("test", "https://comments.example.com");
    expect(result).toEqual([]);
  });

  it("returns empty array on malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 200 })));

    const result = await fetchComments("test", "https://comments.example.com");
    expect(result).toEqual([]);
  });

  it("parses valid JSON response into Comment array", async () => {
    const comments = [
      { id: "1", author: "Alice", body: "Hello", createdAt: "2026-03-25T12:00:00Z", slug: "post-1", status: "approved" },
      { id: "2", author: "Bob", body: "World", createdAt: "2026-03-25T13:00:00Z", slug: "post-1", status: "approved" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(comments), { status: 200 })));

    const result = await fetchComments("post-1", "https://comments.example.com");
    expect(result).toHaveLength(2);
    expect(result[0]!.author).toBe("Alice");
    expect(result[1]!.author).toBe("Bob");
  });

  it("maps snake_case fields from D1 API to camelCase", async () => {
    // D1 returns snake_case (created_at, approved_at) but Comment type uses camelCase
    const d1Response = [
      { id: "1", author: "Ada", body: "Hello", created_at: "2026-03-25T12:00:00Z", slug: "test", status: "approved", approved_at: null },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(d1Response), { status: 200 })));

    const result = await fetchComments("test", "https://comments.example.com");
    expect(result).toHaveLength(1);
    expect(result[0]!.createdAt).toBe("2026-03-25T12:00:00Z");
    expect(result[0]!.author).toBe("Ada");
  });
});
