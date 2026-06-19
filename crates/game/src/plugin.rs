//! Root plugin wiring Track A scene systems plus WASM bridge (A16–A17).

use bevy::prelude::*;

use crate::{
    agent::{animate_capsule_fallback, orient_name_labels, run_demo_patrol, spawn_agents},
    animation::AnimationPlugin,
    bridge::BridgePlugin,
    camera::CameraPlugin,
    lighting::LightingPlugin,
    manifest::AssetManifest,
    movement::{agent_movement, assign_paths_for_walking_agents},
    room::RoomPlugin,
    room_sync::RoomSyncPlugin,
    state::update_agent_states,
    station::StationPlugin,
};

pub struct GamePlugin;

impl Plugin for GamePlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(AssetManifest::load_embedded())
            .add_plugins((
                BridgePlugin,
                CameraPlugin,
                LightingPlugin,
                RoomPlugin,
                StationPlugin,
                AnimationPlugin,
                RoomSyncPlugin,
            ))
            .add_systems(Startup, spawn_agents)
            .add_systems(
                Update,
                (
                    assign_paths_for_walking_agents,
                    run_demo_patrol,
                    agent_movement,
                    update_agent_states,
                    orient_name_labels,
                    animate_capsule_fallback,
                ),
            );
    }
}
