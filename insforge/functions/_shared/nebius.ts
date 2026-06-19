/**
 * Nebius Token Factory — OpenAI-compatible chat client (Track E1–E3).
 */

import type { AgentSnapshot, AgentTurn, TaskAction } from "./protocol.ts";

export const NEBIUS_BASE_URL = "https://api.tokenfactory.nebius.com/v1/";
export const NEBIUS_FAST_MODEL = "meta-llama/Llama-3.3-70B-Instruct";

const JSON_OUTPUT_INSTRUCTION = `
Respond with a single JSON object only — no markdown fences, no commentary.
Schema:
{
  "speech": "string — what you say aloud (1–3 sentences, in character)",
  "task": { "type": "string", "station": "research|code|meet|lounge" } | null
}
Set "task" when the user asks you to go work somewhere or take on a job; otherwise null.
`.trim();

const ROLE_PROMPTS: Record<string, string> = {
  researcher: `You are a curious research analyst. You dig into topics, summarize findings, and suggest next steps. Your home station is "research".`,
  coder: `You are a pragmatic software engineer. You write code, debug issues, and discuss implementation trade-offs. Your home station is "code".`,
  planner: `You are an organized project planner. You break work into milestones, coordinate the team, and run meetings. Your home station is "meet".`,
  social: `You are the team social coordinator. You keep morale up, facilitate casual chat, and welcome visitors. Your home station is "lounge".`,
};

export function buildSystemPrompt(agent: AgentSnapshot): string {
  const rolePrompt =
    ROLE_PROMPTS[agent.role] ??
    `You are a helpful agent in a virtual office. Role: ${agent.role}.`;

  return [
    `You are ${agent.name}, an AI agent in a 3D virtual office hangout.`,
    rolePrompt,
    JSON_OUTPUT_INSTRUCTION,
  ].join("\n\n");
}

export function getNebiusApiKey(): string | null {
  const key = Deno.env.get("NEBIUS_API_KEY");
  return key?.trim() ? key.trim() : null;
}

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

/** OpenAI-compatible chat completion against Nebius Token Factory. */
export async function nebiusChatCompletion(
  messages: ChatMessage[],
  model: string = NEBIUS_FAST_MODEL,
): Promise<string> {
  const apiKey = getNebiusApiKey();
  if (!apiKey) {
    throw new Error("NEBIUS_API_KEY is not configured");
  }

  const response = await fetch(`${NEBIUS_BASE_URL}chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
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
    throw new Error(`Nebius API error (${response.status}): ${detail}`);
  }

  const content = body.choices?.[0]?.message?.content;
  if (!content?.trim()) {
    throw new Error("Nebius returned an empty completion");
  }

  return content.trim();
}

const VALID_STATIONS = new Set(["research", "code", "meet", "lounge"]);

function parseTaskAction(raw: unknown): TaskAction | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return null;

  const record = raw as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type.trim() : "";
  const station = typeof record.station === "string"
    ? record.station.trim()
    : "";

  if (!type || !station || !VALID_STATIONS.has(station)) {
    return null;
  }

  return { type, station };
}

/** Parse and validate structured { speech, task? } from Nebius JSON output (E3). */
export function parseAgentTurn(raw: string): AgentTurn {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Model occasionally wraps JSON in prose — try extracting first object.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return { speech: raw.trim(), task: null };
    }
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return { speech: raw.trim(), task: null };
    }
  }

  if (!parsed || typeof parsed !== "object") {
    return { speech: raw.trim(), task: null };
  }

  const record = parsed as Record<string, unknown>;
  const speech = typeof record.speech === "string"
    ? record.speech.trim()
    : typeof record.response === "string"
    ? record.response.trim()
    : "";

  if (!speech) {
    throw new Error("Agent turn missing required speech field");
  }

  return {
    speech,
    task: parseTaskAction(record.task),
  };
}

/** Canned turn when no LLM backend is available (local dev / demo fallback). */
export function fallbackAgentTurn(
  agent: AgentSnapshot,
  userMessage: string,
): AgentTurn {
  const lower = userMessage.toLowerCase();
  const wantsWork = /\b(go|work|research|code|plan|meet|lounge|bench|desk)\b/.test(
    lower,
  );

  const stationByRole: Record<string, string> = {
    researcher: "research",
    coder: "code",
    planner: "meet",
    social: "lounge",
  };
  const station = stationByRole[agent.role] ?? "research";

  return {
    speech:
      `[${agent.name}] Got it — "${userMessage}". (LLM offline; using canned reply.)`,
    task: wantsWork
      ? { type: agent.role === "coder" ? "code" : "work", station }
      : null,
  };
}
