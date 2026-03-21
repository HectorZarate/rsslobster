import { describe, it, expect, vi } from "vitest";
import { createModelCaller, type ModelConfig } from "./model.js";

describe("model client — openai provider", () => {
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

describe("model client — anthropic provider", () => {
  it("calls the Anthropic messages endpoint", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: "text", text: '{"type":"micro"}' }],
        }),
    });

    const config: ModelConfig = {
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      model: "claude-sonnet-4-20250514",
      apiKey: "sk-ant-test",
    };

    const callModel = createModelCaller(config, mockFetch);
    const result = await callModel("test prompt", 0);

    expect(result).toBe('{"type":"micro"}');
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(opts.headers["x-api-key"]).toBe("sk-ant-test");
    expect(opts.headers["anthropic-version"]).toBe("2023-06-01");

    const body = JSON.parse(opts.body as string);
    expect(body.model).toBe("claude-sonnet-4-20250514");
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(1024);
    expect(body.system).toContain("content classifier");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toBe("test prompt");
  });

  it("prepends custom system prompt for anthropic", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          content: [{ type: "text", text: "ok" }],
        }),
    });

    const config: ModelConfig = {
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      model: "claude-sonnet-4-20250514",
      apiKey: "sk-ant-test",
      systemPrompt: "You are a lobster.",
    };

    const callModel = createModelCaller(config, mockFetch);
    await callModel("hello", 0);

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body as string);
    expect(body.system).toContain("You are a lobster.");
    expect(body.system).toContain("content classifier");
  });

  it("throws on non-ok anthropic response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Rate limited"),
    });

    const config: ModelConfig = {
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      model: "claude-sonnet-4-20250514",
      apiKey: "sk-ant-test",
    };

    const callModel = createModelCaller(config, mockFetch);
    await expect(callModel("test", 0)).rejects.toThrow(
      "Anthropic API error: 429",
    );
  });

  it("throws on empty anthropic content", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ content: [] }),
    });

    const config: ModelConfig = {
      provider: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      model: "claude-sonnet-4-20250514",
      apiKey: "sk-ant-test",
    };

    const callModel = createModelCaller(config, mockFetch);
    await expect(callModel("test", 0)).rejects.toThrow(
      "No response from Anthropic",
    );
  });
});

describe("model client — fallback", () => {
  it("uses primary when it succeeds", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: "primary" } }],
        }),
    });

    const config: ModelConfig = {
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
      apiKey: "ollama",
      fallback: {
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        model: "claude-sonnet-4-20250514",
        apiKey: "sk-ant-test",
      },
    };

    const callModel = createModelCaller(config, mockFetch);
    const result = await callModel("test");
    expect(result).toBe("primary");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it("falls back to secondary on primary failure", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation((_url: string) => {
      callCount++;
      if (callCount === 1) {
        // Primary fails
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve("down"),
        });
      }
      // Fallback succeeds
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            content: [{ type: "text", text: "fallback" }],
          }),
      });
    });

    const config: ModelConfig = {
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
      apiKey: "ollama",
      fallback: {
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
        model: "claude-sonnet-4-20250514",
        apiKey: "sk-ant-test",
      },
    };

    const callModel = createModelCaller(config, mockFetch);
    const result = await callModel("test");
    expect(result).toBe("fallback");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws if both primary and fallback fail", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("down"),
    });

    const config: ModelConfig = {
      baseUrl: "http://localhost:11434/v1",
      model: "llama3",
      apiKey: "ollama",
      fallback: {
        baseUrl: "http://other:11434/v1",
        model: "llama3",
        apiKey: "ollama",
      },
    };

    const callModel = createModelCaller(config, mockFetch);
    await expect(callModel("test")).rejects.toThrow("Model API error: 500");
  });
});
