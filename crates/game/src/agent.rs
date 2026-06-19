//! Agent entities, glTF/capsule visuals, and name labels (A10–A12).

use bevy::prelude::*;
use bevy::scene::SceneInstanceReady;
use protocol::AgentState;

use crate::animation::AgentAnimationBundle;
use crate::manifest::{AgentManifestEntry, AssetManifest};
use crate::movement::MovementPath;
use crate::room_sync::BridgeSyncActive;
use crate::world::protocol_to_world;

#[derive(Component, Debug, Clone)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub role: String,
    pub state: AgentState,
    pub station_id: Option<String>,
    pub backend: String,
}

impl Agent {
    pub fn set_state(&mut self, state: AgentState) {
        self.state = state;
    }
}

#[derive(Component)]
pub struct AgentNameLabel;

#[derive(Component)]
pub struct CapsuleFallback;

#[derive(Component)]
pub struct GltfScenePending {
    pub capsule_entity: Entity,
}

/// Initial spawn layout mirroring `web/js/mock-states.js`.
const SPAWN_TABLE: [(&str, &str, &str, &str, f32, f32, &str); 4] = [
    (
        "researcher",
        "agent-researcher",
        "Researcher",
        "researcher",
        -3.0,
        2.5,
        "research",
    ),
    ("coder", "agent-coder", "Coder", "coder", 3.0, 2.5, "code"),
    (
        "planner",
        "agent-planner",
        "Planner",
        "planner",
        0.0,
        -2.0,
        "meet",
    ),
    (
        "social",
        "agent-social",
        "Social",
        "social",
        -3.0,
        -2.5,
        "lounge",
    ),
];

pub struct AgentPlugin;

impl Plugin for AgentPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_agents).add_systems(
            Update,
            (
                run_demo_patrol,
                orient_name_labels,
                animate_capsule_fallback,
            ),
        );
    }
}

pub fn spawn_agents(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    manifest: Res<AssetManifest>,
    asset_server: Res<AssetServer>,
) {
    for (role_key, id, name, role, x, z, station_id) in SPAWN_TABLE {
        let entry = manifest.agents.get(role_key);
        let color = manifest.fallback_color(role_key);
        let position = protocol_to_world(x, z);

        let agent = Agent {
            id: id.to_string(),
            name: name.to_string(),
            role: role.to_string(),
            state: AgentState::Idle,
            station_id: Some(station_id.to_string()),
            backend: "nebius".to_string(),
        };

        let mut entity_cmd = commands.spawn((
            agent,
            Transform::from_translation(position),
            Visibility::default(),
        ));

        if let Some(entry) = entry {
            entity_cmd.insert(AgentAnimationBundle::new(role_key, entry));
        }

        let entity = entity_cmd.id();

        let capsule = spawn_capsule(
            &mut commands,
            &mut meshes,
            &mut materials,
            entity,
            color,
        );

        if let Some(entry) = entry {
            spawn_gltf_scene(
                &mut commands,
                &asset_server,
                entity,
                entry,
                capsule,
            );
        }

        spawn_name_label(&mut commands, entity, name);
    }
}

fn spawn_capsule(
    commands: &mut Commands,
    meshes: &mut ResMut<Assets<Mesh>>,
    materials: &mut ResMut<Assets<StandardMaterial>>,
    parent: Entity,
    color: Color,
) -> Entity {
    let mut capsule = Entity::PLACEHOLDER;
    commands.entity(parent).with_children(|parent_cmd| {
        capsule = parent_cmd
            .spawn((
                CapsuleFallback,
                Mesh3d(meshes.add(Capsule3d::new(0.35, 1.0))),
                MeshMaterial3d(materials.add(StandardMaterial {
                    base_color: color,
                    ..default()
                })),
                Transform::from_xyz(0.0, 0.9, 0.0),
            ))
            .id();
    });
    capsule
}

fn spawn_gltf_scene(
    commands: &mut Commands,
    asset_server: &AssetServer,
    parent: Entity,
    entry: &AgentManifestEntry,
    capsule_entity: Entity,
) {
    let gltf_path = entry.gltf.clone();
    commands.entity(parent).with_children(|parent_cmd| {
        parent_cmd
            .spawn((
                GltfScenePending { capsule_entity },
                SceneRoot(
                    asset_server.load(GltfAssetLabel::Scene(0).from_asset(gltf_path)),
                ),
                Transform::from_scale(Vec3::splat(0.85)),
            ))
            .observe(on_gltf_scene_ready);
    });
}

fn on_gltf_scene_ready(
    ready: On<SceneInstanceReady>,
    mut commands: Commands,
    pending: Query<&GltfScenePending>,
) {
    let Ok(pending) = pending.get(ready.entity) else {
        return;
    };
    commands.entity(pending.capsule_entity).despawn();
    commands.entity(ready.entity).remove::<GltfScenePending>();
}

fn spawn_name_label(commands: &mut Commands, agent: Entity, name: &str) {
    commands.entity(agent).with_children(|parent| {
        parent.spawn((
            AgentNameLabel,
            Text2d::new(name),
            TextFont {
                font_size: 22.0,
                ..default()
            },
            TextColor(Color::srgba(1.0, 1.0, 1.0, 0.95)),
            TextBackgroundColor(Color::srgba(0.05, 0.06, 0.12, 0.55)),
            Transform::from_xyz(0.0, 2.35, 0.0),
        ));
    });
}

/// Demo patrol: rotate one agent through walking to another station.
pub fn run_demo_patrol(
    bridge_active: Option<Res<BridgeSyncActive>>,
    time: Res<Time>,
    mut commands: Commands,
    mut agents: Query<(Entity, &mut Agent, &Transform), Without<MovementPath>>,
) {
    if bridge_active.map(|active| active.0).unwrap_or(false) {
        return;
    }

    let phase = (time.elapsed_secs() / 10.0) as i32 % 4;

    for (entity, mut agent, transform) in &mut agents {
        let idx = match agent.id.as_str() {
            "agent-researcher" => 0,
            "agent-coder" => 1,
            "agent-planner" => 2,
            "agent-social" => 3,
            _ => continue,
        };

        if idx as i32 != phase {
            continue;
        }

        if agent.state == AgentState::Walking {
            continue;
        }

        let target_station = match idx {
            0 => "code",
            1 => "meet",
            2 => "lounge",
            _ => "research",
        };

        agent.station_id = Some(target_station.to_string());
        agent.set_state(AgentState::Walking);

        let dest = crate::station::station_work_position(target_station);
        commands.entity(entity).insert(MovementPath {
            waypoints: crate::movement::plan_path(transform.translation, dest),
            index: 0,
            destination_station: Some(target_station.to_string()),
        });
    }
}

pub fn orient_name_labels(
    camera: Query<&GlobalTransform, With<crate::camera::MainCamera>>,
    mut labels: Query<&mut Transform, With<AgentNameLabel>>,
) {
    let Ok(camera_transform) = camera.single() else {
        return;
    };
    let forward = camera_transform.forward();
    let flat_forward = Vec3::new(forward.x, 0.0, forward.z).normalize_or_zero();
    if flat_forward.length_squared() < 0.01 {
        return;
    }
    let yaw = flat_forward.x.atan2(flat_forward.z) + std::f32::consts::PI;
    for mut transform in &mut labels {
        transform.rotation = Quat::from_rotation_y(yaw);
    }
}

pub fn animate_capsule_fallback(
    time: Res<Time>,
    agents: Query<(&Agent, &Children)>,
    mut capsules: Query<&mut Transform, With<CapsuleFallback>>,
) {
    let t = time.elapsed_secs();

    for (agent, agent_children) in &agents {
        for child in agent_children.iter() {
            let Ok(mut capsule_transform) = capsules.get_mut(child) else {
                continue;
            };
            let base_y = 0.9;
            let bob = match agent.state {
                AgentState::Idle => (t * 2.0).sin() * 0.03,
                AgentState::Walking => (t * 10.0).sin().abs() * 0.08,
                AgentState::Working => (t * 4.0).sin() * 0.02,
                AgentState::Talking => (t * 6.0).sin() * 0.05,
            };
            capsule_transform.translation.y = base_y + bob;
            capsule_transform.rotation = if agent.state == AgentState::Working {
                Quat::from_rotation_x(-0.15)
            } else {
                Quat::IDENTITY
            };
        }
    }
}
