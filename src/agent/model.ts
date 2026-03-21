import type { CallModel } from "./classify.js";

export interface ModelConfig {
  /** OpenAI-compatible base URL (e.g. http://localhost:11434/v1 for Ollama) */
  baseUrl: string;
  /** Model name (e.g. "llama3", "gpt-4o-mini") */
  model: string;
  /** API key (use "ollama" for local) */
  apiKey: string;
  /** Optional system prompt prepended to every call */
  systemPrompt?: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: { content: string };
  }>;
}

type FetchFn = typeof globalThis.fetch;

const DEFAULT_SYSTEM =
  "You are a content classifier. Respond with valid JSON only.";

/** Create a model caller bound to config. Accepts optional fetch for testing. */
export function createModelCaller(
  config: ModelConfig,
  fetchFn: FetchFn = globalThis.fetch,
): CallModel {
  const url = `${config.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const systemContent = config.systemPrompt
    ? `${config.systemPrompt}\n\n${DEFAULT_SYSTEM}`
    : DEFAULT_SYSTEM;

  return async (userPrompt: string, temperature = 0): Promise<string> => {
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature,
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Model API error: ${res.status} — ${text}`);
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const content = data.choices[0]?.message.content;
    if (!content) {
      throw new Error("No response from model");
    }

    return content;
  };
}
