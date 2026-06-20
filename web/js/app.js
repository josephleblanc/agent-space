/**
 * Browser shell orchestrator (Track B7 wiring).
 * Updates the agent roster from api-client events; mic button drives Vapi (Track D).
 */

import {
  fetchRoomState,
  onRoomState,
  startRoomStatePoll,
} from "./api-client.js";
import {
  CANNED_MODE,
  isCannedModeActive,
  startCannedMode,
  stopCannedMode,
} from "./canned-mode.js";
import { initDevInject } from "./dev-inject.js";
import {
  syncRoomStateToBevy,
  waitForGameBridge,
} from "./game-bridge.js";
import { bindMicButton, initVapiBridge } from "./vapi-bridge.js";

const STATE_LABELS = {
  idle: "Idle",
  walking: "Walking",
  working: "Working",
  talking: "Talking",
};

/** Backends that respond with an honest stub until wired (Track E6). */
const STUB_BACKENDS = new Set(["hermes", "openclaw", "codex"]);

/**
 * @param {string} backend
 * @returns {string}
 */
function formatBackendLabel(backend) {
  const id = String(backend || "nebius").trim().toLowerCase();
  if (STUB_BACKENDS.has(id)) {
    return `${id} (not configured)`;
  }
  return id;
}

/**
 * @param {import("./api-client.js").AgentSnapshot} agent
 * @returns {HTMLElement}
 */
function renderAgentCard(agent) {
  const card = document.createElement("li");
  card.className = "agent-card";
  card.dataset.agentId = agent.id;
  card.dataset.state = agent.state;

  const stateLabel = STATE_LABELS[agent.state] || agent.state;

  card.innerHTML = `
    <div class="agent-card-header">
      <span class="agent-name">${escapeHtml(agent.name)}</span>
      <span class="agent-state-badge" data-state="${agent.state}">${escapeHtml(stateLabel)}</span>
    </div>
    <div class="agent-meta">
      <span class="agent-role">${escapeHtml(agent.role)}</span>
      <span class="agent-station">${agent.station_id ? escapeHtml(agent.station_id) : "—"}</span>
    </div>
    <div class="agent-backend-row">
      <span class="agent-backend-label">Backend</span>
      <span class="agent-backend${STUB_BACKENDS.has(String(agent.backend).toLowerCase()) ? " agent-backend-stub" : ""}">${escapeHtml(formatBackendLabel(agent.backend))}</span>
    </div>
  `;

  return card;
}

/**
 * @param {string} value
 * @returns {string}
 */
function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * @param {import("./api-client.js").RoomSnapshot} snapshot
 */
function updateRoster(snapshot) {
  const list = document.getElementById("agent-roster-list");
  const empty = document.getElementById("agent-roster-empty");
  if (!list) return;

  list.replaceChildren();

  if (!snapshot.agents.length) {
    empty?.removeAttribute("hidden");
    return;
  }

  empty?.setAttribute("hidden", "");

  for (const agent of snapshot.agents) {
    list.appendChild(renderAgentCard(agent));
  }

  const taskCount = document.getElementById("task-count");
  if (taskCount) {
    const active = snapshot.tasks.filter((task) => task.status === "active").length;
    taskCount.textContent = String(active);
  }
}

function bindRosterToggle() {
  const toggle = document.getElementById("roster-toggle");
  const sidebar = document.getElementById("agent-roster");
  if (!toggle || !sidebar) return;

  toggle.addEventListener("click", () => {
    const collapsed = sidebar.classList.toggle("collapsed");
    toggle.setAttribute("aria-expanded", String(!collapsed));
  });
}

function bindRoomStateBridge() {
  onRoomState(({ snapshot }) => {
    updateRoster(snapshot);
    syncRoomStateToBevy(snapshot);
  });
}

function startLivePolling() {
  startRoomStatePoll({
    onError: (error) => {
      if (!isCannedModeActive()) {
        console.warn("[app] room-state poll failed; enabling canned mode:", error);
        startCannedMode();
      }
    },
  });
}

// Wire UI immediately at module load — do not wait on WASM (bootstrap used to hang
// on game-bridge deadlock and never registered these listeners).
try {
  initVapiBridge();
} catch (error) {
  console.warn("[app] Vapi init failed; voice disabled:", error);
}
bindMicButton();
bindRosterToggle();
initDevInject();
bindRoomStateBridge();

async function bootstrap() {
  await waitForGameBridge();

  if (CANNED_MODE) {
    console.info("[app] ?canned=1 — starting scripted demo cycle");
    startCannedMode();
    return;
  }

  try {
    await fetchRoomState();
    stopCannedMode();
  } catch (error) {
    console.warn("[app] initial room-state fetch failed; enabling canned mode:", error);
    startCannedMode();
    return;
  }

  startLivePolling();
}

bootstrap();
