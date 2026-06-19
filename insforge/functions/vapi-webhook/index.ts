/**
 * POST /functions/vapi-webhook
 * Vapi server webhook with full tool handlers (Track E5).
 *
 * Tools: talk_to_agent, assign_task, get_room_status
 */

import type { AgentTurn, TaskAction } from "../_shared/protocol.ts";
import { handlePreflight, errorResponse, jsonResponse } from "../_shared/cors.ts";
import {
  assignTaskToAgent,
  getAgentById,
  getRoomSnapshot,
} from "../_shared/db.ts";
import { AgentBusyError, withAgentLock } from "../_shared/concurrency.ts";
import { resolveDefaultLlmBackend } from "../_shared/backends.ts";
import { NEBIUS_FAST_MODEL } from "../_shared/nebius.ts";
import { OPENROUTER_FAST_MODEL } from "../_shared/openrouter.ts";

interface VapiToolCall {
  id: string;
  type?: string;
  function?: {
    name: string;
    arguments?: string | Record<string, unknown>;
  };
}

interface VapiWebhookBody {
  message?: {
    type?: string;
    toolCallList?: VapiToolCall[];
    toolCalls?: VapiToolCall[];
  };
}

function parseToolArguments(
  raw: string | Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function verifyVapiSecret(req: Request): boolean {
  const expected =
    Deno.env.get("PRIVATE_VAPI_API_KEY") ?? Deno.env.get("VAPI_API_KEY");
  if (!expected) {
    console.warn("PRIVATE_VAPI_API_KEY not set; skipping webhook auth");
    return true;
  }

  const header =
    req.headers.get("X-Vapi-Secret") ??
    req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  return header === expected;
}

function parseTaskAction(args: Record<string, unknown>): TaskAction {
  const type = String(args.type ?? args.task_type ?? "work");
  const station = String(args.station ?? args.station_id ?? "research");
  return { type, station };
}

async function handleGetRoomStatus(): Promise<unknown> {
  const snapshot = await getRoomSnapshot();
  return {
    agents: snapshot.agents.map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role,
      state: a.state,
      station_id: a.station_id,
      backend: a.backend,
    })),
    tasks: snapshot.tasks.map((t) => ({
      id: t.id,
      agent_id: t.agent_id,
      type: t.type,
      station: t.station,
      status: t.status,
    })),
    active_tasks: snapshot.tasks.filter((t) => t.status === "active").length,
  };
}

async function handleTalkToAgent(
  args: Record<string, unknown>,
  req: Request,
): Promise<AgentTurn> {
  const agentId = String(args.agent_id ?? args.agentId ?? "");
  const message = String(args.message ?? "");
  if (!agentId || !message.trim()) {
    throw new Error("talk_to_agent requires agent_id and message");
  }

  const agent = await getAgentById(agentId);
  if (!agent) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  // agent-chat acquires its own per-agent lock — do not wrap here (deadlock).
  const origin = new URL(req.url).origin;
  const chatUrl = `${origin}/functions/agent-chat`;

  const response = await fetch(chatUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: agentId,
      message,
      from_user: "voice",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`agent-chat failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<AgentTurn>;
}

async function handleAssignTask(
  args: Record<string, unknown>,
): Promise<unknown> {
  const agentId = String(args.agent_id ?? args.agentId ?? "");
  if (!agentId) {
    throw new Error("assign_task requires agent_id");
  }

  const agent = await getAgentById(agentId);
  if (!agent) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  const task = parseTaskAction(args);

  return withAgentLock(agentId, async () => {
    try {
      const result = await assignTaskToAgent(agentId, task);
      return {
        ok: true,
        agent_id: agentId,
        agent_name: agent.name,
        task: result.task,
        state: "walking",
      };
    } catch (err) {
      if (err instanceof AgentBusyError) {
        return {
          ok: false,
          agent_id: agentId,
          error: err.message,
        };
      }
      throw err;
    }
  });
}

async function routeToolCall(
  name: string,
  args: Record<string, unknown>,
  req: Request,
): Promise<unknown> {
  switch (name) {
    case "get_room_status":
      return handleGetRoomStatus();

    case "talk_to_agent":
      return handleTalkToAgent(args, req);

    case "assign_task":
      return handleAssignTask(args);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  if (!verifyVapiSecret(req)) {
    return errorResponse("Unauthorized", 401);
  }

  let body: VapiWebhookBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body");
  }

  const messageType = body.message?.type;
  const toolCalls = body.message?.toolCallList ??
    body.message?.toolCalls ??
    [];

  if (messageType !== "tool-calls" || toolCalls.length === 0) {
    const llmBackend = resolveDefaultLlmBackend();
    return jsonResponse({
      ok: true,
      skipped: true,
      type: messageType ?? "unknown",
      llm_backend: llmBackend.id,
      routing_model: llmBackend.id === "openrouter"
        ? OPENROUTER_FAST_MODEL
        : NEBIUS_FAST_MODEL,
    });
  }

  const results: Array<{ toolCallId: string; result: unknown }> = [];

  for (const call of toolCalls) {
    const name = call.function?.name;
    if (!name) continue;

    const args = parseToolArguments(call.function?.arguments);
    try {
      const result = await routeToolCall(name, args, req);
      results.push({ toolCallId: call.id, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Tool call failed";
      results.push({ toolCallId: call.id, result: { error: message } });
    }
  }

  return jsonResponse({ results });
}
