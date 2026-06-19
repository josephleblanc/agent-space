/**
 * Offline canned demo cycle (Track G8).
 * Scripted agent movement when network/API fails or ?canned=1 is set.
 */

import { emitRoomSnapshot } from "./api-client.js";
import { syncRoomStateToBevy } from "./game-bridge.js";
import {
  MOCK_IDLE,
  MOCK_MIXED_ACTIVITY,
  MOCK_RESEARCHER_WORKING,
  MOCK_WALKING,
} from "./mock-states.js";

const CANNED_QUERY = new URLSearchParams(window.location.search).has("canned");

/** Enable via ?canned=1 or after a failed room-state fetch. */
export let CANNED_MODE = CANNED_QUERY;

/** @type {ReturnType<typeof setInterval>|null} */
let cycleTimer = null;

const CYCLE_MS = 4000;

/** @type {import("./api-client.js").RoomSnapshot[]} */
const SCRIPT = [
  MOCK_IDLE,
  MOCK_WALKING,
  MOCK_RESEARCHER_WORKING,
  MOCK_MIXED_ACTIVITY,
];

let scriptIndex = 0;

/**
 * @returns {boolean}
 */
export function isCannedModeActive() {
  return CANNED_MODE;
}

/**
 * Push one scripted snapshot to the UI bus and Bevy.
 * @param {import("./api-client.js").RoomSnapshot} snapshot
 */
function emitScriptedSnapshot(snapshot) {
  emitRoomSnapshot(snapshot, { source: "canned" });
  syncRoomStateToBevy(snapshot);
}

/**
 * Advance to the next frame in the demo script.
 */
export function tickCannedCycle() {
  const snapshot = structuredClone(SCRIPT[scriptIndex]);
  scriptIndex = (scriptIndex + 1) % SCRIPT.length;
  emitScriptedSnapshot(snapshot);
}

/**
 * Start the looping canned demo (idempotent).
 */
export function startCannedMode() {
  if (CANNED_MODE && cycleTimer !== null) {
    return;
  }

  CANNED_MODE = true;
  console.info("[canned-mode] scripted room-state cycle active");

  tickCannedCycle();
  cycleTimer = window.setInterval(tickCannedCycle, CYCLE_MS);
}

/**
 * Stop canned playback (e.g. after a successful live fetch).
 */
export function stopCannedMode() {
  if (cycleTimer !== null) {
    window.clearInterval(cycleTimer);
    cycleTimer = null;
  }
  CANNED_MODE = CANNED_QUERY;
}
