/**
 * OpenRouter — OpenAI-compatible chat client (Nebius fallback).
 */

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1/";
export const OPENROUTER_FAST_MODEL = "meta-llama/llama-3.1-70b-instruct";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
  }>;
  error?: { message?: string };
}

export function getOpenRouterApiKey(): string | null {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  return key?.trim() ? key.trim() : null;
}

/** OpenAI-compatible chat completion against OpenRouter. */
export async function openRouterChatCompletion(
  messages: ChatMessage[],
  model: string = OPENROUTER_FAST_MODEL,
): Promise<string> {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const referer = Deno.env.get("OPENROUTER_HTTP_REFERER");
  if (referer?.trim()) {
    headers["HTTP-Referer"] = referer.trim();
  }

  const title = Deno.env.get("OPENROUTER_APP_TITLE");
  if (title?.trim()) {
    headers["X-Title"] = title.trim();
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 512,
      response_format: { type: "json_object" },
    }),
  });

  const body = (await response.json()) as ChatCompletionResponse;

  if (!response.ok) {
    const detail = body.error?.message ?? response.statusText;
    throw new Error(`OpenRouter API error (${response.status}): ${detail}`);
  }

  const content = body.choices?.[0]?.message?.content;
  if (!content?.trim()) {
    throw new Error("OpenRouter returned an empty completion");
  }

  return content.trim();
}
