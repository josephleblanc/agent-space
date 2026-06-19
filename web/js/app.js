/**
 * Browser shell orchestrator (Track B7 wiring).
 * Updates the agent roster from api-client events; mic button drives Vapi (Track D).
 */

import { fetchRoomState, onRoomState } from "./api-client.js";
import { initDevInject } from "./dev-inject.js";
import { bindMicButton, initVapiBridge } from "./vapi-bridge.js";

const STATE_LABELS = {
  idle: "Idle",
  walking: "Walking",
  working: "Working",
  talking: "Talking",
};

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

async function bootstrap() {
  initVapiBridge();
  bindMicButton();
  bindRosterToggle();
  initDevInject();

  onRoomState(({ snapshot }) => {
    updateRoster(snapshot);
  });

  try {
    await fetchRoomState();
  } catch (error) {
    console.warn("[app] initial room-state fetch failed (dev mocks still work):", error);
  }
}

bootstrap();
