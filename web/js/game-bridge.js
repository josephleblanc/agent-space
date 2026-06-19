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
 * Discover wasm-bindgen exports from Trunk's hashed game module script.
 * @returns {Promise<Record<string, unknown>|null>}
 */
async function discoverWasmExports() {
  if (window.__AGENT_SPACE_WASM__?.on_room_state_sync) {
    return window.__AGENT_SPACE_WASM__;
  }

  const scripts = [...document.querySelectorAll('script[type="module"][src]')];
  for (const script of scripts) {
    const src = script.getAttribute("src");
    if (!src || !src.includes("game-") || !src.endsWith(".js")) {
      continue;
    }

    try {
      const mod = await import(/* @vite-ignore */ src);
      if (mod.on_room_state_sync) {
        return mod;
      }
    } catch (error) {
      console.debug("[game-bridge] import failed for", src, error);
    }
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

  const tryBind = async () => {
    const exports = await discoverWasmExports();
    return exports ? initGameBridge(exports) : false;
  };

  if (await tryBind()) {
    return true;
  }

  return new Promise((resolve) => {
    const onReady = async () => {
      resolve(await tryBind());
    };

    window.addEventListener("TrunkApplicationStarted", onReady, { once: true });
    window.setTimeout(async () => resolve(await tryBind()), 750);
  });
}

/**
 * Install a global hook Trunk/wasm-bindgen glue can populate.
 * @param {Record<string, unknown>} exports
 */
export function exposeWasmExports(exports) {
  initGameBridge(exports);
}
