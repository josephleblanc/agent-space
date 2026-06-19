//! A9 — station anchors for research / code / meet / lounge.

use bevy::prelude::*;

use crate::manifest::AssetManifest;
use crate::world::FLOOR_Y;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum StationId {
    Research,
    Code,
    Meet,
    Lounge,
}

impl StationId {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Research => "research",
            Self::Code => "code",
            Self::Meet => "meet",
            Self::Lounge => "lounge",
        }
    }

    pub fn from_str(id: &str) -> Option<Self> {
        match id {
            "research" => Some(Self::Research),
            "code" => Some(Self::Code),
            "meet" => Some(Self::Meet),
            "lounge" => Some(Self::Lounge),
            _ => None,
        }
    }

    pub fn home_for_role(role: &str) -> Self {
        match role {
            "coder" => Self::Code,
            "planner" => Self::Meet,
            "social" => Self::Lounge,
            _ => Self::Research,
        }
    }
}

#[derive(Component, Debug, Clone)]
pub struct StationMarker {
    pub id: String,
    pub label: String,
    pub work_position: Vec3,
}

#[derive(Resource, Clone, Debug)]
pub struct StationLayout {
    pub stations: Vec<StationDef>,
}

#[derive(Clone, Debug)]
pub struct StationDef {
    pub id: String,
    pub label: String,
    pub anchor: Vec3,
    pub work_offset: Vec3,
    pub models: Vec<String>,
}

impl StationLayout {
    pub fn from_manifest(manifest: &AssetManifest) -> Self {
        let positions = default_station_positions();
        let mut stations = Vec::new();

        for (id, entry) in &manifest.stations {
            let anchor = positions
                .get(id.as_str())
                .copied()
                .unwrap_or_else(|| fallback_position(stations.len()));
            stations.push(StationDef {
                id: entry.id.clone(),
                label: entry.label.clone(),
                anchor,
                work_offset: Vec3::new(0.0, 0.0, 0.8),
                models: entry.models.clone(),
            });
        }

        stations.sort_by(|a, b| a.id.cmp(&b.id));
        Self { stations }
    }

    pub fn get(&self, id: &str) -> Option<&StationDef> {
        self.stations.iter().find(|station| station.id == id)
    }

    pub fn position(&self, station: StationId) -> Vec3 {
        self.work_position(station.as_str())
            .unwrap_or(Vec3::ZERO)
    }

    pub fn work_position(&self, id: &str) -> Option<Vec3> {
        self.get(id)
            .map(|station| station.anchor + station.work_offset)
    }
}

/// Work position for a station id (used before `StationLayout` is available).
pub fn station_work_position(station_id: &str) -> Vec3 {
    let anchor = default_station_positions()
        .get(station_id)
        .copied()
        .unwrap_or(Vec3::new(0.0, FLOOR_Y, 0.0));
    anchor + Vec3::new(0.0, 0.0, 0.8)
}

fn default_station_positions() -> std::collections::HashMap<&'static str, Vec3> {
    [
        ("research", Vec3::new(-3.0, FLOOR_Y, 2.5)),
        ("code", Vec3::new(3.0, FLOOR_Y, 2.5)),
        ("meet", Vec3::new(0.0, FLOOR_Y, -2.0)),
        ("lounge", Vec3::new(-3.0, FLOOR_Y, -2.5)),
    ]
    .into_iter()
    .collect()
}

fn fallback_position(index: usize) -> Vec3 {
    let angle = index as f32 * std::f32::consts::FRAC_PI_2;
    Vec3::new(angle.cos() * 4.0, FLOOR_Y, angle.sin() * 4.0)
}

pub struct StationPlugin;

impl Plugin for StationPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, (init_station_layout, spawn_stations).chain());
    }
}

fn init_station_layout(mut commands: Commands, manifest: Res<AssetManifest>) {
    commands.insert_resource(StationLayout::from_manifest(&manifest));
}

fn spawn_stations(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
    layout: Res<StationLayout>,
    asset_server: Res<AssetServer>,
) {
    for station in &layout.stations {
        let marker = StationMarker {
            id: station.id.clone(),
            label: station.label.clone(),
            work_position: station.anchor + station.work_offset,
        };

        let root = commands
            .spawn((
                marker,
                Transform::from_translation(station.anchor),
                Visibility::default(),
            ))
            .id();

        spawn_station_props(
            &mut commands,
            &mut meshes,
            &mut materials,
            &asset_server,
            root,
            station,
        );
    }
}

fn spawn_station_props(
    commands: &mut Commands,
    meshes: &mut ResMut<Assets<Mesh>>,
    materials: &mut ResMut<Assets<StandardMaterial>>,
    asset_server: &AssetServer,
    parent: Entity,
    station: &StationDef,
) {
    let wood = materials.add(StandardMaterial {
        base_color: Color::srgb(0.55, 0.42, 0.30),
        ..default()
    });
    let metal = materials.add(StandardMaterial {
        base_color: Color::srgb(0.65, 0.68, 0.72),
        ..default()
    });
    let fabric = materials.add(StandardMaterial {
        base_color: Color::srgb(0.35, 0.45, 0.62),
        ..default()
    });
    let plant = materials.add(StandardMaterial {
        base_color: Color::srgb(0.28, 0.55, 0.32),
        ..default()
    });

    for model_path in &station.models {
        let _handle: Handle<Mesh> = asset_server.load(model_path.clone());
    }

    match station.id.as_str() {
        "research" => {
            spawn_prop(commands, meshes, wood.clone(), parent, Vec3::ZERO, Vec3::new(1.6, 0.75, 0.8));
            spawn_prop(
                commands,
                meshes,
                wood.clone(),
                parent,
                Vec3::new(-1.1, 0.0, -0.4),
                Vec3::new(0.5, 1.4, 0.35),
            );
            spawn_prop(
                commands,
                meshes,
                plant,
                parent,
                Vec3::new(1.0, 0.0, -0.6),
                Vec3::new(0.35, 0.5, 0.35),
            );
        }
        "code" => {
            spawn_prop(
                commands,
                meshes,
                wood.clone(),
                parent,
                Vec3::new(0.0, 0.0, 0.0),
                Vec3::new(1.4, 0.75, 0.7),
            );
            spawn_prop(
                commands,
                meshes,
                metal.clone(),
                parent,
                Vec3::new(0.0, 0.85, -0.15),
                Vec3::new(0.55, 0.45, 0.08),
            );
            spawn_prop(
                commands,
                meshes,
                fabric,
                parent,
                Vec3::new(0.0, 0.0, 1.0),
                Vec3::new(0.55, 0.85, 0.55),
            );
        }
        "meet" => {
            spawn_prop(
                commands,
                meshes,
                wood.clone(),
                parent,
                Vec3::ZERO,
                Vec3::new(2.0, 0.45, 2.0),
            );
            for offset in [(-0.9, 0.9), (0.9, 0.9), (-0.9, -0.9), (0.9, -0.9)] {
                spawn_prop(
                    commands,
                    meshes,
                    fabric.clone(),
                    parent,
                    Vec3::new(offset.0, 0.0, offset.1),
                    Vec3::new(0.45, 0.75, 0.45),
                );
            }
        }
        "lounge" => {
            spawn_prop(
                commands,
                meshes,
                fabric.clone(),
                parent,
                Vec3::new(-0.5, 0.0, 0.0),
                Vec3::new(1.6, 0.55, 0.75),
            );
            spawn_prop(
                commands,
                meshes,
                fabric.clone(),
                parent,
                Vec3::new(0.9, 0.0, 0.4),
                Vec3::new(0.65, 0.65, 0.65),
            );
            spawn_prop(
                commands,
                meshes,
                wood,
                parent,
                Vec3::new(0.8, 0.0, -0.5),
                Vec3::new(0.45, 0.35, 0.45),
            );
        }
        _ => {
            spawn_prop(commands, meshes, metal, parent, Vec3::ZERO, Vec3::new(1.0, 0.5, 1.0));
        }
    }

    let ring = materials.add(StandardMaterial {
        base_color: Color::srgba(0.9, 0.9, 1.0, 0.25),
        alpha_mode: AlphaMode::Blend,
        unlit: true,
        ..default()
    });
    commands
        .spawn((
            Mesh3d(meshes.add(Cylinder::new(0.9, 0.02))),
            MeshMaterial3d(ring),
            Transform::from_xyz(0.0, 0.02, 0.0),
        ))
        .insert(ChildOf(parent));
}

fn spawn_prop(
    commands: &mut Commands,
    meshes: &mut ResMut<Assets<Mesh>>,
    material: Handle<StandardMaterial>,
    parent: Entity,
    offset: Vec3,
    size: Vec3,
) {
    commands
        .spawn((
            Mesh3d(meshes.add(Cuboid::new(size.x, size.y, size.z))),
            MeshMaterial3d(material),
            Transform::from_translation(offset + Vec3::new(0.0, size.y * 0.5, 0.0)),
            ChildOf(parent),
        ));
}
