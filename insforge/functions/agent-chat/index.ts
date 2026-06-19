/**
 * POST /functions/agent-chat
 * Skeleton agent turn handler — Nebius LLM wiring lands in Track E.
 */

import type { AgentTurn } from "../_shared/protocol.ts";
import { handlePreflight, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getAgentById, insertMessage } from "../_shared/db.ts";
import {
  AgentBusyError,
  withAgentLock,
} from "../_shared/concurrency.ts";

export interface AgentChatRequest {
  agent_id: string;
  message: string;
  from_user?: string;
}

function parseBody(body: unknown): AgentChatRequest | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.agent_id !== "string" || typeof record.message !== "string") {
    return null;
  }
  return {
    agent_id: record.agent_id,
    message: record.message,
    from_user: typeof record.from_user === "string" ? record.from_user : undefined,
  };
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  let payload: AgentChatRequest | null;
  try {
    payload = parseBody(await req.json());
  } catch {
    return errorResponse("Invalid JSON body");
  }

  if (!payload?.agent_id || !payload.message.trim()) {
    return errorResponse("agent_id and message are required");
  }

  const agent = await getAgentById(payload.agent_id);
  if (!agent) {
    return errorResponse(`Unknown agent: ${payload.agent_id}`, 404);
  }

  try {
    const turn = await withAgentLock(payload.agent_id, async (): Promise<AgentTurn> => {
      await insertMessage(payload!.agent_id, "user", payload!.message);

      // Track E: call Nebius with per-agent system prompt + structured JSON output.
      const reply: AgentTurn = {
        speech: `[${agent.name}] I heard you: "${payload!.message}". LLM wiring comes in Track E.`,
        task: null,
      };

      await insertMessage(payload!.agent_id, "assistant", reply.speech);
      return reply;
    });

    return jsonResponse(turn);
  } catch (err) {
    if (err instanceof AgentBusyError) {
      return errorResponse(err.message, 409);
    }
    console.error("agent-chat failed", err);
    return errorResponse("Internal server error", 500);
  }
}
