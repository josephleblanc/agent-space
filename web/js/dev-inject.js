/**
 * Dev-only mock room-state injector (Track B6).
 * Keyboard shortcuts and panel buttons push snapshots without hitting the network.
 */

import {
  emitRoomSnapshot,
  fetchRoomState,
  getRoomStateUrl,
} from "./api-client.js";
import { MOCK_PRESETS } from "./mock-states.js";

const DEV_QUERY = new URLSearchParams(window.location.search).has("dev");
const DEV_HOST =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

/** @type {boolean} */
let injectMode = false;

/**
 * @returns {boolean}
 */
export function isDevModeEnabled() {
  return DEV_QUERY || DEV_HOST;
}

/**
 * @returns {boolean}
 */
export function isInjectModeActive() {
  return injectMode;
}

/**
 * Push a named mock preset into the app event bus.
 * @param {keyof typeof MOCK_PRESETS} preset
 */
export function injectMockPreset(preset) {
  const snapshot = MOCK_PRESETS[preset];
  if (!snapshot) {
    console.warn(`[dev-inject] unknown preset: ${preset}`);
    return;
  }
  emitRoomSnapshot(structuredClone(snapshot), { source: "dev-inject", preset });
}

/**
 * @param {boolean} active
 */
export function setInjectMode(active) {
  injectMode = active;
  document.body.classList.toggle("dev-inject-active", active);
  const panel = document.getElementById("dev-panel");
  if (panel) {
    panel.hidden = !active;
  }
}

function toggleInjectMode() {
  setInjectMode(!injectMode);
}

function bindDevPanel() {
  const panel = document.getElementById("dev-panel");
  if (!panel) return;

  panel.querySelectorAll("[data-mock-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = /** @type {keyof typeof MOCK_PRESETS} */ (
        button.getAttribute("data-mock-preset")
      );
      injectMockPreset(preset);
    });
  });

  const fetchBtn = document.getElementById("dev-fetch-live");
  fetchBtn?.addEventListener("click", async () => {
    try {
      await fetchRoomState();
    } catch (error) {
      console.error("[dev-inject] live fetch failed:", error);
    }
  });

  const toggleBtn = document.getElementById("dev-toggle-inject");
  toggleBtn?.addEventListener("click", toggleInjectMode);

  const urlEl = document.getElementById("dev-room-state-url");
  if (urlEl) {
    urlEl.textContent = getRoomStateUrl();
  }
}

function bindKeyboardShortcuts() {
  window.addEventListener("keydown", (event) => {
    if (!isDevModeEnabled()) return;
    if (event.target instanceof HTMLInputElement) return;
    if (event.target instanceof HTMLTextAreaElement) return;

    const key = event.key.toLowerCase();

    if (event.altKey && key === "d") {
      event.preventDefault();
      toggleInjectMode();
      return;
    }

    if (!injectMode) return;

    const presetMap = {
      "1": "idle",
      "2": "walking",
      "3": "working",
      "4": "mixed",
    };

    const preset = presetMap[key];
    if (preset) {
      event.preventDefault();
      injectMockPreset(/** @type {keyof typeof MOCK_PRESETS} */ (preset));
    }
  });
}

/**
 * Initialize dev tooling when running locally or ?dev=1 is present.
 */
export function initDevInject() {
  if (!isDevModeEnabled()) {
    return;
  }

  document.body.classList.add("dev-mode");
  bindDevPanel();
  bindKeyboardShortcuts();
  console.info(
    "[dev-inject] Alt+D toggles panel; 1–4 inject mock states when inject mode is on",
  );
}
