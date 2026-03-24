import type { CallModel } from "./classify.js";

/** Provider type for LLM calls */
export type ModelProvider = "openai" | "anthropic";

export interface ModelConfig {
  /** Provider type. Default: "openai" (OpenAI-compatible, works with Ollama etc.) */
  provider?: ModelProvider;
  /** OpenAI-compatible base URL (e.g. http://localhost:11434/v1 for Ollama) */
  baseUrl: string;
  /** Model name (e.g. "llama3", "gpt-4o-mini", "claude-sonnet-4-20250514") */
  model: string;
  /** API key (use "ollama" for local) */
  apiKey: string;
  /** Optional system prompt prepended to every call */
  systemPrompt?: string;
  /** Optional fallback provider config. Used if the primary fails. */
  fallback?: ModelConfig;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

interface AnthropicResponse {
  content: Array<{
    type: string;
    text?: string;
  }>;
}

type FetchFn = typeof globalThis.fetch;

const DEFAULT_SYSTEM =
  "You are a content classifier. Respond with valid JSON only.";

function resolveSystemPrompt(custom?: string): string {
  return custom ? `${custom}\n\n${DEFAULT_SYSTEM}` : DEFAULT_SYSTEM;
}

/** Create a model caller that uses the OpenAI chat completions API. */
function createOpenAICaller(
  config: ModelConfig,
  fetchFn: FetchFn,
): CallModel {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const systemContent = resolveSystemPrompt(config.systemPrompt);
  let supportsJsonMode = true;

  async function call(userPrompt: string, temperature: number, useJsonMode: boolean): Promise<string> {
    const body: Record<string, unknown> = {
      model: config.model,
      temperature,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userPrompt },
      ],
    };
    if (useJsonMode) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      // If the provider doesn't support response_format, retry without it
      if (useJsonMode && res.status === 400 && text.includes("response_format")) {
        supportsJsonMode = false;
        return call(userPrompt, temperature, false);
      }
      throw new Error(`Model API error: ${res.status} — ${text}`);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const content = data.choices[0]?.message.content;
    if (!content) {
      throw new Error("No response from model");
    }

    return content;
  }

  return (userPrompt: string, temperature = 0): Promise<string> => {
    return call(userPrompt, temperature, supportsJsonMode);
  };
}

/** Create a model caller that uses the Anthropic Messages API. */
function createAnthropicCaller(
  config: ModelConfig,
  fetchFn: FetchFn,
): CallModel {
  const url = `${config.baseUrl.replace(/\/$/, "")}/messages`;
  const systemContent = resolveSystemPrompt(config.systemPrompt);

  return async (userPrompt: string, temperature = 0): Promise<string> => {
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: 1024,
        temperature,
        system: systemContent,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Anthropic API error: ${res.status} — ${text}`);
    }

    const data = (await res.json()) as AnthropicResponse;
    const textBlock = data.content.find((b) => b.type === "text");
    if (!textBlock?.text) {
      throw new Error("No response from Anthropic model");
    }

    return textBlock.text;
  };
}

/** Create a caller for a single provider (no fallback). */
function createSingleCaller(
  config: ModelConfig,
  fetchFn: FetchFn,
): CallModel {
  const provider = config.provider ?? "openai";
  switch (provider) {
    case "anthropic":
      return createAnthropicCaller(config, fetchFn);
    case "openai":
      return createOpenAICaller(config, fetchFn);
    default:
      throw new Error(`Unknown model provider: ${provider as string}`);
  }
}

/**
 * Create a model caller bound to config. Accepts optional fetch for testing.
 *
 * If `config.fallback` is set, the primary provider is tried first.
 * On failure, the fallback provider is used.
 */
export function createModelCaller(
  config: ModelConfig,
  fetchFn: FetchFn = globalThis.fetch,
): CallModel {
  const primary = createSingleCaller(config, fetchFn);

  if (!config.fallback) {
    return primary;
  }

  const secondary = createSingleCaller(config.fallback, fetchFn);

  return async (userPrompt: string, temperature?: number): Promise<string> => {
    try {
      return await primary(userPrompt, temperature);
    } catch {
      return secondary(userPrompt, temperature);
    }
  };
}
