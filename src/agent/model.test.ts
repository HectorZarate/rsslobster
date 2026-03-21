import { describe, it, expect, vi } from "vitest";
import { createModelCaller, type ModelConfig } from "./model.js";

describe("model client", () => {
  it("calls the correct endpoint with the right payload", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: '{"type":"micro"}' } }],
        }),
    });

    const config: ModelConfig = {
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
      apiKey: "ollama",
    };

    const callModel = createModelCaller(config, mockFetch);
    const result = await callModel("test prompt", 0);

    expect(result).toBe('{"type":"micro"}');
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    const body = JSON.parse(opts.body as string);
    expect(body.model).toBe("llama3");
    expect(body.temperature).toBe(0);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].content).toBe("test prompt");
  });

  it("reads SOUL.md content as system message when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "response" } }],
        }),
    });

    const config: ModelConfig = {
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
      apiKey: "ollama",
      systemPrompt: "You are a lobster.",
    };

    const callModel = createModelCaller(config, mockFetch);
    await callModel("hello", 0);

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
    expect(body.messages[0].content).toContain("You are a lobster.");
  });

  it("throws on non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const config: ModelConfig = {
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
      apiKey: "ollama",
    };

    const callModel = createModelCaller(config, mockFetch);
    await expect(callModel("test", 0)).rejects.toThrow("Model API error: 500");
  });

  it("throws on empty choices", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [] }),
    });

    const config: ModelConfig = {
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
      apiKey: "ollama",
    };

    const callModel = createModelCaller(config, mockFetch);
    await expect(callModel("test", 0)).rejects.toThrow("No response");
  });

  it("defaults to temperature 0", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "ok" } }],
        }),
    });

    const config: ModelConfig = {
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
      apiKey: "ollama",
    };

    const callModel = createModelCaller(config, mockFetch);
    await callModel("test");

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
    expect(body.temperature).toBe(0);
  });
});
