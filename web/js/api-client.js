/**
 * InsForge room-state fetch wrapper (Track B3/B5 + D5 polish).
 * Consumes the frozen RoomSnapshot JSON contract from crates/protocol.
 *
 * Bevy sync path: fetchRoomState → emitRoomSnapshot → app.js onRoomState → syncRoomStateToBevy.
 * Voice tools also call refreshRoomStateAfterVoiceTool() for immediate post-tool sync.
 */

/** @typedef {"idle"|"walking"|"working"|"talking"} AgentState */
/** @typedef {"pending"|"active"|"completed"|"failed"} TaskStatus */

/**
 * @typedef {Object} AgentSnapshot
 * @property {string} id
 * @property {string} name
 * @property {string} role
 * @property {AgentState} state
 * @property {string|null} station_id
 * @property {number} x
 * @property {number} y
 * @property {string} backend
 */

/**
 * @typedef {Object} TaskSnapshot
 * @property {string} id
 * @property {string} agent_id
 * @property {string} type
 * @property {string} station
 * @property {TaskStatus} status
 */

/**
 * @typedef {Object} RoomSnapshot
 * @property {AgentSnapshot[]} agents
 * @property {TaskSnapshot[]} tasks
 */

const ROOM_STATE_EVENT = "agent-space:room-state";

/** @type {RoomSnapshot|null} */
let lastSnapshot = null;

/** @type {(() => string)|null} */
let urlOverride = null;

/**
 * Resolve InsForge base URL from build-time or runtime config.
 * @returns {string}
 */
export function getInsforgeBaseUrl() {
  if (urlOverride) {
    return urlOverride();
  }

  const fromMeta =
    typeof import.meta !== "undefined" && import.meta.env?.VITE_INSFORGE_URL;
  const fromWindow =
    typeof window !== "undefined" && window.__ENV__?.VITE_INSFORGE_URL;
  const raw = fromMeta || fromWindow || "";
  const trimmed = String(raw).trim();

  if (trimmed) {
    return trimmed.replace(/\/+$/, "");
  }

  return "http://127.0.0.1:8787";
}

/**
 * Build the room-state endpoint URL from a base InsForge URL.
 * Supports direct polling, proxy-relative paths, and `/functions` suffix.
 * @param {string} [base]
 * @returns {string}
 */
export function getRoomStateUrl(base = getInsforgeBaseUrl()) {
  const normalized = String(base).trim().replace(/\/+$/, "");

  if (!normalized || normalized === "/") {
    return "/functions/room-state";
  }

  if (normalized.endsWith("/functions")) {
    return `${normalized}/room-state`;
  }

  if (normalized.startsWith("/")) {
    return `${normalized}/room-state`.replace(/\/+/g, "/");
  }

  return `${normalized}/functions/room-state`;
}

/**
 * Dev-only: override how the base URL is resolved (mock injector).
 * @param {(() => string)|null} resolver
 */
export function setUrlOverride(resolver) {
  urlOverride = resolver;
}

/**
 * @returns {RoomSnapshot|null}
 */
export function getLastSnapshot() {
  return lastSnapshot;
}

/**
 * Dispatch a room snapshot to listeners (dev inject + future WASM bridge).
 * @param {RoomSnapshot} snapshot
 * @param {{ source?: string }} [meta]
 */
export function emitRoomSnapshot(snapshot, meta = {}) {
  lastSnapshot = snapshot;
  window.dispatchEvent(
    new CustomEvent(ROOM_STATE_EVENT, {
      detail: { snapshot, ...meta },
    }),
  );
}

/**
 * Subscribe to room-state updates.
 * @param {(detail: { snapshot: RoomSnapshot, source?: string }) => void} handler
 * @returns {() => void}
 */
export function onRoomState(handler) {
  const listener = (event) => handler(/** @type {CustomEvent} */ (event).detail);
  window.addEventListener(ROOM_STATE_EVENT, listener);
  return () => window.removeEventListener(ROOM_STATE_EVENT, listener);
}

/**
 * Fetch the current room snapshot from InsForge.
 * @param {RequestInit} [init]
 * @returns {Promise<RoomSnapshot>}
 */
export async function fetchRoomState(init = {}) {
  const url = getRoomStateUrl();
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    ...init,
  });

  if (!response.ok) {
    throw new Error(
      `room-state ${response.status}: ${response.statusText} (${url})`,
    );
  }

  /** @type {RoomSnapshot} */
  const snapshot = await response.json();
  emitRoomSnapshot(snapshot, { source: "fetch" });
  return snapshot;
}

const DEFAULT_POLL_MS = 500;

/** @type {ReturnType<typeof setInterval>|null} */
let pollTimer = null;

/**
 * Immediate room-state fetch after a Vapi tool mutates backend state (Track D5).
 * Test: assign_task via voice → roster + Bevy avatar should update within one round-trip
 * (does not wait for the 500 ms poll interval).
 * @returns {Promise<RoomSnapshot>}
 */
export async function refreshRoomStateAfterVoiceTool() {
  return fetchRoomState();
}

/**
 * Poll room-state on an interval (Track B5).
 * Each tick emits agent-space:room-state; app.js forwards snapshots to Bevy via game-bridge.
 * @param {{ intervalMs?: number, onError?: (error: unknown) => void }} [options]
 * @returns {() => void} stop polling
 */
export function startRoomStatePoll(options = {}) {
  const { intervalMs = DEFAULT_POLL_MS, onError } = options;

  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
  }

  const tick = async () => {
    try {
      await fetchRoomState();
    } catch (error) {
      onError?.(error);
    }
  };

  tick();
  pollTimer = window.setInterval(tick, intervalMs);

  return () => {
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

export { ROOM_STATE_EVENT };
