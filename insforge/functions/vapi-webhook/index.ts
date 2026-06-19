/**
 * POST /functions/vapi-webhook
 * Vapi server webhook skeleton with tool-call routing (Track D/E flesh out behavior).
 *
 * Expected tools: talk_to_agent, assign_task, get_room_status
 */

import { handlePreflight, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getRoomSnapshot } from "../_shared/db.ts";
import { withAgentLock } from "../_shared/concurrency.ts";

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
  const expected = Deno.env.get("VAPI_API_KEY");
  if (!expected) {
    // Local dev without secrets — allow but log.
    console.warn("VAPI_API_KEY not set; skipping webhook auth");
    return true;
  }

  const header =
    req.headers.get("X-Vapi-Secret") ??
    req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  return header === expected;
}

async function routeToolCall(
  name: string,
  args: Record<string, unknown>,
  req: Request,
): Promise<unknown> {
  switch (name) {
    case "get_room_status": {
      const snapshot = await getRoomSnapshot();
      return {
        agents: snapshot.agents.map((a) => ({
          id: a.id,
          name: a.name,
          role: a.role,
          state: a.state,
          station_id: a.station_id,
        })),
        active_tasks: snapshot.tasks.filter((t) => t.status === "active").length,
      };
    }

    case "talk_to_agent": {
      const agentId = String(args.agent_id ?? args.agentId ?? "");
      const message = String(args.message ?? "");
      if (!agentId || !message) {
        throw new Error("talk_to_agent requires agent_id and message");
      }

      // agent-chat acquires its own per-agent lock — do not wrap here (deadlock).
      const origin = new URL(req.url).origin;
      const chatUrl = `${origin}/functions/agent-chat`;

      const response = await fetch(chatUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, message }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`agent-chat failed (${response.status}): ${text}`);
      }

      return response.json();
    }

    case "assign_task": {
      const agentId = String(args.agent_id ?? args.agentId ?? "");
      const taskType = String(args.type ?? args.task_type ?? "work");
      const station = String(args.station ?? "research");
      if (!agentId) {
        throw new Error("assign_task requires agent_id");
      }

      // Track E: persist task row + transition agent state in Postgres.
      return withAgentLock(agentId, async () => ({
        ok: true,
        agent_id: agentId,
        task: { type: taskType, station },
        note: "Task persistence lands in Track E",
      }));
    }

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
    return jsonResponse({ ok: true, skipped: true, type: messageType ?? "unknown" });
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
