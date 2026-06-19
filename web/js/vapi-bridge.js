/**
 * Vapi voice bridge (Track D1/D2/D3/D4).
 * Ephemeral inline assistant via vapi.start({...}); server tools hit InsForge vapi-webhook.
 */

import Vapi from "./vapi-sdk.js";
import { getInsforgeBaseUrl } from "./api-client.js";

const VAPI_EVENT = "agent-space:vapi";

/** @type {InstanceType<typeof Vapi>|null} */
let vapiInstance = null;

/** @type {boolean} */
let callActive = false;

/**
 * Resolve Vapi public key from build-time or runtime config.
 * @returns {string}
 */
export function getVapiPublicKey() {
  const fromMeta =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_VAPI_PUBLIC_KEY;
  const fromWindow =
    typeof window !== "undefined" && window.__ENV__?.VITE_VAPI_PUBLIC_KEY;
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
      "[vapi-bridge] VITE_VAPI_PUBLIC_KEY not set; voice is disabled",
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
 * Speak agent reply via Vapi TTS (Track D5 hook for agent-chat responses).
 * @param {string} text
 * @param {boolean} [endCallAfterSpoken]
 */
export function sayAgentSpeech(text, endCallAfterSpoken = false) {
  if (!vapiInstance || !callActive) {
    console.warn("[vapi-bridge] say() skipped — no active call");
    return;
  }
  vapiInstance.say(text, endCallAfterSpoken);
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
    mic.title = "Set VITE_VAPI_PUBLIC_KEY in .env to enable voice";
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
      mic.title = "Set VITE_VAPI_PUBLIC_KEY in .env to enable voice";
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
