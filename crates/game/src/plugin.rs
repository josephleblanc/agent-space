//! Root plugin wiring Track A scene systems (A6–A15).

use bevy::prelude::*;

use crate::{
    agent::{animate_capsule_fallback, orient_name_labels, run_demo_patrol, spawn_agents},
    animation::AnimationPlugin,
    camera::CameraPlugin,
    lighting::LightingPlugin,
    manifest::AssetManifest,
    movement::{agent_movement, assign_paths_for_walking_agents},
    room::RoomPlugin,
    state::update_agent_states,
    station::StationPlugin,
};

pub struct GamePlugin;

impl Plugin for GamePlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(AssetManifest::load_embedded())
            .add_plugins((
                CameraPlugin,
                LightingPlugin,
                RoomPlugin,
                StationPlugin,
                AnimationPlugin,
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
