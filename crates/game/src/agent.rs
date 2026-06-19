//! Agent entities spawned from manifest (A10).

use bevy::prelude::*;
use protocol::AgentState;

use crate::{
    avatar::{AvatarLoad, spawn_avatar_for_agent},
    labels::spawn_name_label,
    manifest::GameManifest,
    movement::DemoPatrol,
    station::StationId,
};

#[derive(Component, Debug, Clone)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub role: String,
    pub backend: String,
}

#[derive(Component, Debug, Clone, Deref, DerefMut)]
pub struct AgentActivity(pub AgentState);

const SPAWN_POSITIONS: [(&str, Vec3); 4] = [
    ("researcher", Vec3::new(-2.5, 0.0, 0.0)),
    ("coder", Vec3::new(2.5, 0.0, 0.0)),
    ("planner", Vec3::new(0.0, 0.0, -1.5)),
    ("social", Vec3::new(0.0, 0.0, 1.5)),
];

pub fn spawn_agents(
    mut commands: Commands,
    manifest: Res<GameManifest>,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let mut patrol = DemoPatrol::default();

    for (agent_key, position) in SPAWN_POSITIONS {
        let Some(entry) = manifest.agents.get(agent_key) else {
            warn!("manifest missing agent `{agent_key}`");
            continue;
        };

        let fallback_color = manifest
            .fallback_colors
            .get(&entry.role)
            .copied()
            .unwrap_or(Color::srgb(0.6, 0.6, 0.6));

        let agent_entity = commands
            .spawn((
                Agent {
                    id: entry.id.clone(),
                    name: entry.name.clone(),
                    role: entry.role.clone(),
                    backend: "nebius".into(),
                },
                AgentActivity(AgentState::Idle),
                Transform::from_translation(position),
                GlobalTransform::default(),
                AvatarLoad {
                    gltf_path: entry.gltf.clone(),
                    fallback_color,
                    animation_names: entry.animations.clone(),
                    scene: None,
                    gltf: None,
                },
            ))
            .id();

        spawn_name_label(&mut commands, agent_entity, &entry.name);
        spawn_avatar_for_agent(
            &mut commands,
            agent_entity,
            &mut meshes,
            &mut materials,
            fallback_color,
        );

        let home = StationId::home_for_role(&entry.role);
        patrol.schedule(agent_entity, home, 2.0 + patrol.entries.len() as f32);
    }

    commands.insert_resource(patrol);
}
