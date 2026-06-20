/**
 * WASM ↔ JS glue for Bevy (Track B4).
 * Calls wasm-bindgen exports from crates/game/src/bridge.rs.
 */

/** @typedef {import("./api-client.js").RoomSnapshot} RoomSnapshot */

/** @type {{ on_room_state_sync?: (json: string) => void, on_agent_speech?: (agentId: string, text: string) => void, bridge_ping?: () => boolean } | null} */
let wasmExports = null;

/** @type {RoomSnapshot[]} */
const pendingSnapshots = [];

/** @type {{ agentId: string, text: string }[]} */
const pendingSpeeches = [];

/**
 * Resolve wasm-bindgen exports set by Trunk's bootstrap script.
 * Avoid dynamic `import()` of the game module — it can deadlock with Trunk's
 * in-flight WASM init and leave app.js bootstrap hanging forever.
 * @returns {Record<string, unknown>|null}
 */
function discoverWasmExports() {
  if (window.__AGENT_SPACE_WASM__?.on_room_state_sync) {
    return window.__AGENT_SPACE_WASM__;
  }

  if (window.wasmBindings?.on_room_state_sync) {
    return window.wasmBindings;
  }

  return null;
}

/**
 * Register wasm-bindgen exports once Trunk has initialized the module.
 * @param {Record<string, unknown>} exports
 * @returns {boolean}
 */
export function initGameBridge(exports) {
  if (!exports?.on_room_state_sync) {
    console.warn("[game-bridge] WASM exports missing on_room_state_sync");
    return false;
  }

  wasmExports = /** @type {NonNullable<typeof wasmExports>} */ (exports);
  window.__AGENT_SPACE_WASM__ = exports;

  for (const snapshot of pendingSnapshots.splice(0)) {
    syncRoomStateToBevy(snapshot);
  }

  for (const speech of pendingSpeeches.splice(0)) {
    notifyAgentSpeech(speech.agentId, speech.text);
  }

  if (wasmExports.bridge_ping?.()) {
    console.info("[game-bridge] WASM bridge ready");
  }

  window.hideAgentSpaceSplash?.();

  return true;
}

/**
 * Push a room snapshot into Bevy.
 * @param {RoomSnapshot} snapshot
 */
export function syncRoomStateToBevy(snapshot) {
  if (!wasmExports?.on_room_state_sync) {
    pendingSnapshots.push(snapshot);
    return;
  }

  try {
    wasmExports.on_room_state_sync(JSON.stringify(snapshot));
  } catch (error) {
    console.error("[game-bridge] on_room_state_sync failed:", error);
  }
}

/**
 * Forward agent speech into Bevy (Track D5 hook).
 * Test: notifyAgentSpeech("agent-researcher", "Hi") → WASM on_agent_speech → Talking animation.
 * @param {string} agentId
 * @param {string} text
 */
export function notifyAgentSpeech(agentId, text) {
  if (!wasmExports?.on_agent_speech) {
    pendingSpeeches.push({ agentId, text });
    return;
  }

  try {
    wasmExports.on_agent_speech(agentId, text);
  } catch (error) {
    console.error("[game-bridge] on_agent_speech failed:", error);
  }
}

/**
 * Wait for Trunk to finish booting WASM and wire exports.
 * @returns {Promise<boolean>}
 */
export async function waitForGameBridge() {
  if (wasmExports) {
    return true;
  }

  const tryBind = () => {
    const exports = discoverWasmExports();
    return exports ? initGameBridge(exports) : false;
  };

  if (tryBind()) {
    return true;
  }

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
    if (tryBind()) {
      return true;
    }
  }

  console.warn("[game-bridge] WASM bridge not available after timeout");
  return false;
}

/**
 * Install a global hook Trunk/wasm-bindgen glue can populate.
 * @param {Record<string, unknown>} exports
 */
export function exposeWasmExports(exports) {
  initGameBridge(exports);
}
