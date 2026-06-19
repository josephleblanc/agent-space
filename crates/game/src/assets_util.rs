//! Shared asset path helpers for native + WASM release builds.

/// Bevy `AssetServer` paths are relative to the `assets/` folder (copied by Trunk to `dist/assets/`).
pub fn game_asset(path: &str) -> String {
    path.trim_start_matches("assets/").to_string()
}
