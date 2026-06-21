/**
 * Vapi voice bridge (Track D1/D2/D3/D4/D5).
 * Ephemeral inline assistant via vapi.start({...}); server tools hit InsForge vapi-webhook.
 *
 * Test paths (see docs/INTEGRATION.md §4–5):
 * - talk_to_agent: voice → webhook → tool-calls-result → sayAgentSpeech() → vapi.say + WASM Talking
 * - assign_task: tool-calls-result → refreshRoomStateAfterVoiceTool() → poll/Bevy walking
 * - Dev console: sayAgentSpeech("agent-researcher", "Hello from dev") during an active call
 */

import VapiModule from "./vapi-sdk.js";
import {
  getInsforgeBaseUrl,
  refreshRoomStateAfterVoiceTool,
} from "./api-client.js";
import { notifyAgentSpeech } from "./game-bridge.js";

/** @type {new (key: string) => InstanceType<any>} */
const Vapi = resolveVapiConstructor(VapiModule);

/**
 * esbuild CJS interop can nest the constructor at `.default.default`.
 * @param {unknown} mod
 */
function resolveVapiConstructor(mod) {
  const candidate =
    /** @type {any} */ (mod)?.default?.default ??
    /** @type {any} */ (mod)?.default ??
    mod;
  if (typeof candidate !== "function") {
    throw new TypeError("[vapi-bridge] Vapi SDK export is not a constructor");
  }
  return candidate;
}

const VAPI_EVENT = "agent-space:vapi";

/** Tool names whose webhook results mutate room snapshot (Bevy sync via api-client). */
const ROOM_STATE_VOICE_TOOLS = new Set([
  "talk_to_agent",
  "assign_task",
  "request_custom_item",
]);

/** @type {InstanceType<typeof Vapi>|null} */
let vapiInstance = null;

/** @type {boolean} */
let callActive = false;

/** @type {Map<string, { name: string, args: Record<string, unknown> }>} */
const pendingToolCalls = new Map();

/**
 * Resolve Vapi public key from build-time or runtime config.
 * @returns {string}
 */
export function getVapiPublicKey() {
  const env =
    typeof import.meta !== "undefined" ? import.meta.env : undefined;
  const winEnv =
    typeof window !== "undefined" ? window.__ENV__ : undefined;
  const fromMeta =
    env?.VITE_PUBLIC_API_KEY || env?.VITE_VAPI_PUBLIC_KEY;
  const fromWindow =
    winEnv?.VITE_PUBLIC_API_KEY || winEnv?.VITE_VAPI_PUBLIC_KEY;
  return String(fromMeta || fromWindow || "").trim();
}

/**
 * Build the vapi-webhook URL from the InsForge base URL (mirrors api-client path rules).
 * @param {string} [base]
 * @returns {string}
 */
export function getVapiWebhookUrl(base = getInsforgeBaseUrl()) {
  const normalized = String(base).trim().replace(/\/+$/, "");

  if (!normalized || normalized === "/") {
    return "/functions/vapi-webhook";
  }

  if (normalized.endsWith("/functions")) {
    return `${normalized}/vapi-webhook`;
  }

  if (normalized.startsWith("/")) {
    return `${normalized}/functions/vapi-webhook`.replace(/\/+/g, "/");
  }

  return `${normalized}/functions/vapi-webhook`;
}

/**
 * Ephemeral assistant config — no dashboard assistant ID (Track D1).
 * @param {string} webhookUrl
 */
export function buildAssistantConfig(webhookUrl) {
  return {
    name: "Agent Space",
    firstMessage:
      "Welcome to Agent Space. You can talk to Researcher, Coder, Planner, or Social. Who would you like to speak with?",
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en-US",
    },
    model: {
      provider: "openai",
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are the voice concierge for Agent Space, a 3D hangout with four AI agents:
- agent-researcher (Researcher): explores topics and gathers information
- agent-coder (Coder): writes and reviews code
- agent-planner (Planner): plans tasks and coordinates work
- agent-social (Social): handles social coordination and meetings

Use talk_to_agent when the user wants to converse with a specific agent.
Use assign_task to send an agent to work at a station (research, code, meet, lounge).
Use get_room_status to check who is in the room and what tasks are active.
Use request_custom_item when the user asks to add furniture, props, or clothing to the room.
Keep responses concise and conversational.`,
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "talk_to_agent",
            description:
              "Send a message to a specific agent and receive their spoken reply",
            parameters: {
              type: "object",
              properties: {
                agent_id: {
                  type: "string",
                  description:
                    "Agent id: agent-researcher, agent-coder, agent-planner, or agent-social",
                },
                message: {
                  type: "string",
                  description: "The user's message for the agent",
                },
              },
              required: ["agent_id", "message"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "assign_task",
            description:
              "Assign a task to an agent and send them to a station",
            parameters: {
              type: "object",
              properties: {
                agent_id: {
                  type: "string",
                  description: "Agent id to assign the task to",
                },
                type: {
                  type: "string",
                  description: "Task type, e.g. research, code, plan, socialize",
                },
                station: {
                  type: "string",
                  description:
                    "Destination station: research, code, meet, or lounge",
                },
              },
              required: ["agent_id", "type", "station"],
            },
          },
        },
        {
          type: "function",
          function: {
            name: "get_room_status",
            description:
              "Get the current roster of agents and count of active tasks",
            parameters: {
              type: "object",
              properties: {},
            },
          },
        },
        {
          type: "function",
          function: {
            name: "request_custom_item",
            description:
              "Generate and spawn a custom prop, furniture item, or clothing in the 3D room from a natural-language description",
            parameters: {
              type: "object",
              properties: {
                description: {
                  type: "string",
                  description:
                    "What to create, e.g. whiteboard by the meeting table, plant by the window, red hoodie for the coder",
                },
                requested_by_agent: {
                  type: "string",
                  description:
                    "Optional agent id requesting the item: agent-researcher, agent-coder, agent-planner, or agent-social",
                },
                kind: {
                  type: "string",
                  description: "Asset category: prop, clothing, or furniture",
                  enum: ["prop", "clothing", "furniture"],
                },
              },
              required: ["description"],
            },
          },
        },
      ],
    },
    voice: {
      provider: "11labs",
      voiceId: "burt",
    },
    server: {
      url: webhookUrl,
    },
    serverMessages: ["tool-calls", "tool-calls-result"],
    clientMessages: ["transcript", "speech-update", "status-update"],
  };
}

/**
 * @returns {boolean}
 */
export function isVapiCallActive() {
  return callActive;
}

/**
 * @returns {InstanceType<typeof Vapi>|null}
 */
export function getVapi() {
  return vapiInstance;
}

/**
 * Create the Vapi client and wire event listeners (Track D2).
 * @returns {InstanceType<typeof Vapi>|null}
 */
export function initVapiBridge() {
  const publicKey = getVapiPublicKey();
  if (!publicKey) {
    console.warn(
      "[vapi-bridge] VITE_PUBLIC_API_KEY not set; voice is disabled",
    );
    return null;
  }

  if (vapiInstance) {
    return vapiInstance;
  }

  vapiInstance = new Vapi(publicKey);

  vapiInstance.on("call-start", () => {
    callActive = true;
    updateMicUi(true);
    window.dispatchEvent(
      new CustomEvent(VAPI_EVENT, { detail: { type: "call-start" } }),
    );
  });

  vapiInstance.on("call-end", () => {
    callActive = false;
    pendingToolCalls.clear();
    updateMicUi(false);
    window.dispatchEvent(
      new CustomEvent(VAPI_EVENT, { detail: { type: "call-end" } }),
    );
  });

  vapiInstance.on("speech-start", () => {
    window.dispatchEvent(
      new CustomEvent(VAPI_EVENT, { detail: { type: "speech-start" } }),
    );
  });

  vapiInstance.on("speech-end", () => {
    window.dispatchEvent(
      new CustomEvent(VAPI_EVENT, { detail: { type: "speech-end" } }),
    );
  });

  vapiInstance.on("error", (error) => {
    console.error("[vapi-bridge] error:", error);
    window.dispatchEvent(
      new CustomEvent(VAPI_EVENT, { detail: { type: "error", error } }),
    );
  });

  vapiInstance.on("message", (message) => {
    if (message?.type === "transcript" && message.transcriptType === "final") {
      console.debug("[vapi-bridge] transcript:", message.transcript);
    }

    if (message?.type === "tool-calls") {
      rememberToolCalls(message);
    } else if (message?.type === "tool-calls-result") {
      handleToolCallResult(message);
    }

    window.dispatchEvent(
      new CustomEvent(VAPI_EVENT, { detail: { type: "message", message } }),
    );
  });

  return vapiInstance;
}

/**
 * Start an ephemeral voice session (Track D1).
 * @returns {boolean}
 */
export function startVoiceCall() {
  window.resumeAudioContext?.();

  const vapi = initVapiBridge();
  if (!vapi) {
    return false;
  }

  if (callActive) {
    return true;
  }

  const webhookUrl = getVapiWebhookUrl();
  const config = buildAssistantConfig(webhookUrl);
  console.info("[vapi-bridge] starting call; webhook:", webhookUrl);
  vapi.start(config);
  return true;
}

/** End the active Vapi session. */
export function stopVoiceCall() {
  vapiInstance?.stop();
}

/**
 * Parse tool-call arguments from Vapi client messages.
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function parseToolArguments(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return /** @type {Record<string, unknown>} */ (raw);
  if (typeof raw !== "string") return {};
  try {
    return /** @type {Record<string, unknown>} */ (JSON.parse(raw));
  } catch {
    return {};
  }
}

/**
 * Remember outbound tool calls so tool-calls-result can recover agent_id.
 * @param {{ toolCallList?: Array<{ id?: string, function?: { name?: string, arguments?: unknown } }> }} message
 */
function rememberToolCalls(message) {
  for (const call of message.toolCallList ?? []) {
    const id = call?.id;
    const name = call?.function?.name;
    if (!id || !name) continue;
    pendingToolCalls.set(id, {
      name,
      args: parseToolArguments(call.function?.arguments),
    });
  }
}

/**
 * Parse webhook tool result payload (string JSON or object).
 * @param {unknown} raw
 * @returns {Record<string, unknown>|null}
 */
function parseToolResult(raw) {
  if (!raw) return null;
  if (typeof raw === "object") {
    return /** @type {Record<string, unknown>} */ (raw);
  }
  if (typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? /** @type {Record<string, unknown>} */ (parsed) : null;
  } catch {
    return null;
  }
}

/**
 * Resolve agent id from tool-calls-result + pending tool-call args.
 * @param {string} toolCallId
 * @param {Record<string, unknown>|null} result
 * @returns {string}
 */
function resolveAgentId(toolCallId, result) {
  const fromResult = String(result?.agent_id ?? result?.agentId ?? "").trim();
  if (fromResult) return fromResult;

  const pending = pendingToolCalls.get(toolCallId);
  const fromArgs = String(
    pending?.args?.agent_id ?? pending?.args?.agentId ?? "",
  ).trim();
  return fromArgs;
}

/**
 * Handle Vapi tool-calls-result: speak agent replies + sync Bevy (Track D5).
 * @param {{ toolCallResult?: Record<string, unknown> }} message
 */
function handleToolCallResult(message) {
  const toolCallResult = message.toolCallResult;
  if (!toolCallResult || typeof toolCallResult !== "object") return;

  const name = String(toolCallResult.name ?? "");
  const toolCallId = String(toolCallResult.toolCallId ?? "");
  const result = parseToolResult(toolCallResult.result);

  if (toolCallId) {
    pendingToolCalls.delete(toolCallId);
  }

  if (name === "talk_to_agent") {
    const speech = String(result?.speech ?? "").trim();
    const agentId = resolveAgentId(toolCallId, result);
    if (speech && agentId) {
      sayAgentSpeech(agentId, speech);
    } else if (speech) {
      console.warn("[vapi-bridge] talk_to_agent speech without agent_id");
      sayAgentSpeech("", speech);
    }
  } else if (name === "request_custom_item") {
    const speech = String(result?.speech ?? "").trim();
    const agentId = resolveAgentId(toolCallId, result);
    if (speech) {
      sayAgentSpeech(agentId || "", speech);
    }
  }

  if (ROOM_STATE_VOICE_TOOLS.has(name)) {
    refreshRoomStateAfterVoiceTool().catch((error) => {
      console.warn("[vapi-bridge] room-state refresh after voice tool failed:", error);
    });
  }
}

/**
 * Speak agent reply via Vapi TTS and sync Bevy Talking state (Track D5).
 * @param {string} agentId
 * @param {string} text
 * @param {boolean} [endCallAfterSpoken]
 */
export function sayAgentSpeech(agentId, text, endCallAfterSpoken = false) {
  const speech = String(text ?? "").trim();
  if (!speech) {
    console.warn("[vapi-bridge] say() skipped — empty speech");
    return;
  }

  if (agentId) {
    notifyAgentSpeech(agentId, speech);
  }

  if (!vapiInstance || !callActive) {
    console.warn("[vapi-bridge] say() skipped — no active call (Bevy sync still applied)");
    return;
  }

  vapiInstance.say(speech, endCallAfterSpoken);
}

/**
 * @param {boolean} active
 */
function updateMicUi(active) {
  const mic = document.getElementById("mic-button");
  if (!mic) return;

  mic.classList.toggle("mic-active", active);
  mic.setAttribute("aria-pressed", String(active));

  const label = mic.querySelector(".mic-label");
  if (label) {
    label.textContent = active ? "End call" : "Start voice";
  }

  mic.setAttribute(
    "aria-label",
    active ? "End voice call" : "Start voice call",
  );
}

/**
 * Wire the mic button to toggle Vapi sessions (Track D2).
 * @param {string} [buttonId]
 */
export function bindMicButton(buttonId = "mic-button") {
  const mic = document.getElementById(buttonId);
  if (!mic) return;

  if (!getVapiPublicKey()) {
    mic.classList.add("mic-disabled");
    mic.title = "Set VITE_PUBLIC_API_KEY in .env to enable voice";
    const label = mic.querySelector(".mic-label");
    if (label) {
      label.textContent = "Voice unavailable";
    }
  }

  mic.addEventListener("click", () => {
    window.resumeAudioContext?.();

    if (callActive) {
      stopVoiceCall();
      return;
    }

    const started = startVoiceCall();
    if (!started) {
      mic.classList.add("mic-disabled");
      mic.title = "Set VITE_PUBLIC_API_KEY in .env to enable voice";
    }
  });
}

/**
 * Subscribe to Vapi bridge events.
 * @param {(detail: Record<string, unknown>) => void} handler
 * @returns {() => void}
 */
export function onVapiEvent(handler) {
  const listener = (event) =>
    handler(/** @type {CustomEvent} */ (event).detail);
  window.addEventListener(VAPI_EVENT, listener);
  return () => window.removeEventListener(VAPI_EVENT, listener);
}

export { VAPI_EVENT };
