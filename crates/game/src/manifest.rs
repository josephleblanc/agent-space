//! Asset manifest loaded from `assets/manifest.json`.

use bevy::prelude::{App, Color, Plugin, Resource};
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize, Resource)]
pub struct AssetManifest {
    pub agents: HashMap<String, AgentManifestEntry>,
    pub stations: HashMap<String, StationManifestEntry>,
    pub fallback: FallbackManifest,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AgentManifestEntry {
    pub name: String,
    pub role: String,
    pub gltf: String,
    pub animations: AgentAnimationsManifest,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AgentAnimationsManifest {
    pub idle: String,
    pub walking: String,
    pub working: String,
    pub talking: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StationManifestEntry {
    pub id: String,
    pub label: String,
    pub models: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FallbackManifest {
    pub colors: HashMap<String, String>,
}

impl AssetManifest {
    pub fn load_embedded() -> Self {
        let json = include_str!("../../../assets/manifest.json");
        serde_json::from_str(json).expect("parse assets/manifest.json")
    }

    pub fn fallback_color(&self, role: &str) -> Color {
        let hex = self.fallback.colors.get(role).map(String::as_str).unwrap_or("#888888");
        parse_hex_color(hex)
    }
}

pub struct ManifestPlugin;

impl Plugin for ManifestPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(AssetManifest::load_embedded());
    }
}

pub fn parse_hex_color(hex: &str) -> Color {
    let hex = hex.trim_start_matches('#');
    if hex.len() != 6 {
        return Color::srgb(0.5, 0.5, 0.5);
    }
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(128);
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(128);
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(128);
    Color::srgb_u8(r, g, b)
}

pub fn animation_index(name: &str) -> Option<usize> {
    Some(match name {
        "static" => 0,
        "idle" => 1,
        "walk" | "walking" => 2,
        "sprint" => 3,
        "sit" => 4,
        "drive" => 5,
        "die" => 6,
        "pick-up" => 7,
        "emote-yes" => 8,
        "emote-no" => 9,
        "holding-right" => 10,
        "holding-left" => 11,
        "holding-both" => 12,
        "holding-right-shoot" => 13,
        "holding-left-shoot" => 14,
        "holding-both-shoot" => 15,
        "attack-melee-right" => 16,
        "attack-melee-left" => 17,
        "attack-kick-right" => 18,
        "attack-kick-left" => 19,
        "interact-right" => 20,
        "interact-left" => 21,
        "wheelchair-sit" => 22,
        "wheelchair-move-forward" => 23,
        "wheelchair-move-back" => 24,
        "wheelchair-move-left" => 25,
        "wheelchair-move-right" => 26,
        _ => return None,
    })
}
