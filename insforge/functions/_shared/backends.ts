/**
 * AgentBackend interface + Nebius/OpenRouter/Hermes/OpenClaw/Codex adapters (Track E6).
 */

import type { AgentSnapshot, AgentTurn } from "./protocol.ts";
import {
  buildSystemPrompt,
  fallbackAgentTurn,
  getNebiusApiKey,
  nebiusChatCompletion,
  parseAgentTurn,
} from "./nebius.ts";
import {
  getOpenRouterApiKey,
  openRouterChatCompletion,
} from "./openrouter.ts";

export interface AgentChatInput {
  agent: AgentSnapshot;
  userMessage: string;
  fromUser?: string;
}

export interface AgentBackend {
  readonly id: string;
  generateTurn(input: AgentChatInput): Promise<AgentTurn>;
}

function formatUserMessage(input: AgentChatInput): string {
  const { userMessage, fromUser } = input;
  return fromUser ? `[User ${fromUser}]: ${userMessage}` : userMessage;
}

export class NebiusBackend implements AgentBackend {
  readonly id = "nebius";

  async generateTurn(input: AgentChatInput): Promise<AgentTurn> {
    const { agent, userMessage } = input;

    try {
      const raw = await nebiusChatCompletion([
        { role: "system", content: buildSystemPrompt(agent) },
        { role: "user", content: formatUserMessage(input) },
      ]);
      return parseAgentTurn(raw);
    } catch (err) {
      console.warn("NebiusBackend fallback", err);
      return fallbackAgentTurn(agent, userMessage);
    }
  }
}

export class OpenRouterBackend implements AgentBackend {
  readonly id = "openrouter";

  async generateTurn(input: AgentChatInput): Promise<AgentTurn> {
    const { agent, userMessage } = input;

    try {
      const raw = await openRouterChatCompletion([
        { role: "system", content: buildSystemPrompt(agent) },
        { role: "user", content: formatUserMessage(input) },
      ]);
      return parseAgentTurn(raw);
    } catch (err) {
      console.warn("OpenRouterBackend fallback", err);
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
          `[${input.agent.name}] ${label} is not configured for this demo. ` +
          `Set AGENT_BACKEND=nebius (default) or wire ${label} in backends.ts. ` +
          `I heard: "${input.userMessage}".`,
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
const openRouterBackend = new OpenRouterBackend();

const BACKENDS: Record<string, AgentBackend> = {
  nebius: nebiusBackend,
  openrouter: openRouterBackend,
  hermes: hermesBackend,
  openclaw: openClawBackend,
  codex: codexBackend,
};

/** Pick Nebius when configured, otherwise OpenRouter, otherwise Nebius (canned fallback). */
export function resolveDefaultLlmBackend(): AgentBackend {
  if (getNebiusApiKey()) return nebiusBackend;
  if (getOpenRouterApiKey()) return openRouterBackend;
  return nebiusBackend;
}

/** Resolve the backend adapter for an agent's configured backend field. */
export function resolveBackend(agent: AgentSnapshot): AgentBackend {
  if (agent.backend === "nebius" || !(agent.backend in BACKENDS)) {
    return resolveDefaultLlmBackend();
  }

  const configured = BACKENDS[agent.backend];
  if (agent.backend === "openrouter" && !getOpenRouterApiKey()) {
    return resolveDefaultLlmBackend();
  }

  return configured;
}
