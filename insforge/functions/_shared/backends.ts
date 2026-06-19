/**
 * AgentBackend interface + Nebius/Hermes/OpenClaw/Codex adapters (Track E6).
 */

import type { AgentSnapshot, AgentTurn } from "./protocol.ts";
import {
  buildSystemPrompt,
  fallbackAgentTurn,
  nebiusChatCompletion,
  parseAgentTurn,
} from "./nebius.ts";

export interface AgentChatInput {
  agent: AgentSnapshot;
  userMessage: string;
  fromUser?: string;
}

export interface AgentBackend {
  readonly id: string;
  generateTurn(input: AgentChatInput): Promise<AgentTurn>;
}

export class NebiusBackend implements AgentBackend {
  readonly id = "nebius";

  async generateTurn(input: AgentChatInput): Promise<AgentTurn> {
    const { agent, userMessage, fromUser } = input;

    try {
      const raw = await nebiusChatCompletion([
        { role: "system", content: buildSystemPrompt(agent) },
        {
          role: "user",
          content: fromUser
            ? `[User ${fromUser}]: ${userMessage}`
            : userMessage,
        },
      ]);
      return parseAgentTurn(raw);
    } catch (err) {
      console.warn("NebiusBackend fallback", err);
      return fallbackAgentTurn(agent, userMessage);
    }
  }
}

function stubBackend(id: string, label: string): AgentBackend {
  return {
    id,
    async generateTurn(input: AgentChatInput): Promise<AgentTurn> {
      return {
        speech:
          `[${input.agent.name}] The ${label} backend is not wired yet. I heard: "${input.userMessage}".`,
        task: null,
      };
    },
  };
}

export const hermesBackend: AgentBackend = stubBackend("hermes", "Hermes");
export const openClawBackend: AgentBackend = stubBackend(
  "openclaw",
  "OpenClaw",
);
export const codexBackend: AgentBackend = stubBackend("codex", "Codex");

const nebiusBackend = new NebiusBackend();

const BACKENDS: Record<string, AgentBackend> = {
  nebius: nebiusBackend,
  hermes: hermesBackend,
  openclaw: openClawBackend,
  codex: codexBackend,
};

/** Resolve the backend adapter for an agent's configured backend field. */
export function resolveBackend(agent: AgentSnapshot): AgentBackend {
  return BACKENDS[agent.backend] ?? nebiusBackend;
}
