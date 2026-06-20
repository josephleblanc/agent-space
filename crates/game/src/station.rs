//! A9 — station anchors for research / code / meet / lounge.

use bevy::prelude::*;

use crate::assets_util::game_asset;
use crate::manifest::AssetManifest;
use crate::obj_loader::{ObjMesh, ObjPropHandle};
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

#[derive(Clone, Copy)]
struct PropPlacement {
    model_suffix: &'static str,
    offset: Vec3,
    rotation_y: f32,
    target_size: f32,
    material: PropMaterial,
}

#[derive(Clone, Copy)]
enum PropMaterial {
    Wood,
    Metal,
    Fabric,
    Plant,
}

fn station_prop_layout(station_id: &str) -> &'static [PropPlacement] {
    match station_id {
        "research" => &RESEARCH_PROPS,
        "code" => &CODE_PROPS,
        "meet" => &MEET_PROPS,
        "lounge" => &LOUNGE_PROPS,
        _ => &[],
    }
}

const RESEARCH_PROPS: [PropPlacement; 3] = [
    PropPlacement {
        model_suffix: "desk.obj",
        offset: Vec3::ZERO,
        rotation_y: 0.0,
        target_size: 1.6,
        material: PropMaterial::Wood,
    },
    PropPlacement {
        model_suffix: "bookcaseOpen.obj",
        offset: Vec3::new(-0.85, 0.0, -0.35),
        rotation_y: 0.15,
        target_size: 1.2,
        material: PropMaterial::Wood,
    },
    PropPlacement {
        model_suffix: "pottedPlant.obj",
        offset: Vec3::new(0.75, 0.0, -0.45),
        rotation_y: 0.0,
        target_size: 0.7,
        material: PropMaterial::Plant,
    },
];

const CODE_PROPS: [PropPlacement; 4] = [
    PropPlacement {
        model_suffix: "deskCorner.obj",
        offset: Vec3::ZERO,
        rotation_y: 0.0,
        target_size: 1.4,
        material: PropMaterial::Wood,
    },
    PropPlacement {
        model_suffix: "computerScreen.obj",
        offset: Vec3::new(0.0, 0.55, -0.12),
        rotation_y: 0.0,
        target_size: 0.55,
        material: PropMaterial::Metal,
    },
    PropPlacement {
        model_suffix: "laptop.obj",
        offset: Vec3::new(0.25, 0.52, 0.08),
        rotation_y: -0.35,
        target_size: 0.35,
        material: PropMaterial::Metal,
    },
    PropPlacement {
        model_suffix: "chairDesk.obj",
        offset: Vec3::new(0.0, 0.0, 0.85),
        rotation_y: std::f32::consts::PI,
        target_size: 0.9,
        material: PropMaterial::Fabric,
    },
];

const MEET_PROPS: [PropPlacement; 5] = [
    PropPlacement {
        model_suffix: "tableRound.obj",
        offset: Vec3::ZERO,
        rotation_y: 0.0,
        target_size: 1.8,
        material: PropMaterial::Wood,
    },
    PropPlacement {
        model_suffix: "chairRounded.obj",
        offset: Vec3::new(-0.75, 0.0, 0.75),
        rotation_y: -0.9,
        target_size: 0.75,
        material: PropMaterial::Fabric,
    },
    PropPlacement {
        model_suffix: "chairRounded.obj",
        offset: Vec3::new(0.75, 0.0, 0.75),
        rotation_y: 0.9,
        target_size: 0.75,
        material: PropMaterial::Fabric,
    },
    PropPlacement {
        model_suffix: "chairRounded.obj",
        offset: Vec3::new(-0.75, 0.0, -0.75),
        rotation_y: -2.4,
        target_size: 0.75,
        material: PropMaterial::Fabric,
    },
    PropPlacement {
        model_suffix: "chairRounded.obj",
        offset: Vec3::new(0.75, 0.0, -0.75),
        rotation_y: 2.4,
        target_size: 0.75,
        material: PropMaterial::Fabric,
    },
];

const LOUNGE_PROPS: [PropPlacement; 3] = [
    PropPlacement {
        model_suffix: "loungeSofa.obj",
        offset: Vec3::new(-0.55, 0.0, 0.15),
        rotation_y: 0.0,
        target_size: 1.4,
        material: PropMaterial::Fabric,
    },
    PropPlacement {
        model_suffix: "loungeChair.obj",
        offset: Vec3::new(1.05, 0.0, 0.55),
        rotation_y: -0.55,
        target_size: 0.85,
        material: PropMaterial::Fabric,
    },
    PropPlacement {
        model_suffix: "sideTable.obj",
        offset: Vec3::new(0.45, 0.0, -0.75),
        rotation_y: 0.0,
        target_size: 0.5,
        material: PropMaterial::Wood,
    },
];

#[derive(Component)]
struct ProceduralPropFallback;

#[derive(Component)]
struct PendingObjProp {
    fallback: Entity,
    material: Handle<StandardMaterial>,
    transform: Transform,
}

pub struct StationPlugin;

impl Plugin for StationPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, (init_station_layout, spawn_stations).chain())
            .add_systems(Update, finalize_loaded_obj_props);
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
    let ring = materials.add(StandardMaterial {
        base_color: Color::srgba(0.9, 0.9, 1.0, 0.25),
        alpha_mode: AlphaMode::Blend,
        unlit: true,
        ..default()
    });
    let material_handles = PropMaterialHandles {
        wood,
        metal,
        fabric,
        plant,
    };

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
            &asset_server,
            root,
            station,
            &material_handles,
        );

        commands.entity(root).with_children(|parent| {
            parent.spawn((
                Mesh3d(meshes.add(Cylinder::new(0.9, 0.02))),
                MeshMaterial3d(ring.clone()),
                Transform::from_xyz(0.0, 0.02, 0.0),
            ));
        });
    }
}

struct PropMaterialHandles {
    wood: Handle<StandardMaterial>,
    metal: Handle<StandardMaterial>,
    fabric: Handle<StandardMaterial>,
    plant: Handle<StandardMaterial>,
}

impl PropMaterialHandles {
    fn resolve(&self, material: PropMaterial) -> Handle<StandardMaterial> {
        match material {
            PropMaterial::Wood => self.wood.clone(),
            PropMaterial::Metal => self.metal.clone(),
            PropMaterial::Fabric => self.fabric.clone(),
            PropMaterial::Plant => self.plant.clone(),
        }
    }
}

fn spawn_station_props(
    commands: &mut Commands,
    meshes: &mut ResMut<Assets<Mesh>>,
    asset_server: &AssetServer,
    parent: Entity,
    station: &StationDef,
    materials: &PropMaterialHandles,
) {
    for placement in station_prop_layout(&station.id) {
        let Some(model_path) = station
            .models
            .iter()
            .find(|path| path.ends_with(placement.model_suffix))
        else {
            continue;
        };

        let fallback = spawn_procedural_fallback(commands, meshes, parent, *placement, materials);

        let material = materials.resolve(placement.material);
        let transform = Transform {
            translation: placement.offset,
            rotation: Quat::from_rotation_y(placement.rotation_y),
            scale: Vec3::splat(placement.target_size),
        };

        let obj_handle: Handle<ObjMesh> = asset_server.load(game_asset(model_path));

        commands.spawn((
            PendingObjProp {
                fallback,
                material,
                transform,
            },
            ObjPropHandle(obj_handle),
            ChildOf(parent),
        ));
    }
}

fn spawn_procedural_fallback(
    commands: &mut Commands,
    meshes: &mut ResMut<Assets<Mesh>>,
    parent: Entity,
    placement: PropPlacement,
    materials: &PropMaterialHandles,
) -> Entity {
    let (size, y_lift) = procedural_size_for(placement.model_suffix);
    let material = materials.resolve(placement.material);
    let mut entity = Entity::PLACEHOLDER;
    commands.entity(parent).with_children(|parent_cmd| {
        entity = parent_cmd
            .spawn((
                ProceduralPropFallback,
                Mesh3d(meshes.add(Cuboid::new(size.x, size.y, size.z))),
                MeshMaterial3d(material),
                Transform {
                    translation: placement.offset + Vec3::new(0.0, size.y * 0.5 + y_lift, 0.0),
                    rotation: Quat::from_rotation_y(placement.rotation_y),
                    scale: Vec3::ONE,
                },
            ))
            .id();
    });
    entity
}

fn procedural_size_for(model_suffix: &str) -> (Vec3, f32) {
    match model_suffix {
        "desk.obj" | "deskCorner.obj" => (Vec3::new(1.6, 0.75, 0.8), 0.0),
        "bookcaseOpen.obj" => (Vec3::new(0.5, 1.4, 0.35), 0.0),
        "pottedPlant.obj" => (Vec3::new(0.35, 0.5, 0.35), 0.0),
        "computerScreen.obj" => (Vec3::new(0.55, 0.45, 0.08), 0.55),
        "laptop.obj" => (Vec3::new(0.35, 0.05, 0.25), 0.52),
        "chairDesk.obj" | "chairRounded.obj" | "loungeChair.obj" => {
            (Vec3::new(0.55, 0.85, 0.55), 0.0)
        }
        "tableRound.obj" => (Vec3::new(2.0, 0.45, 2.0), 0.0),
        "loungeSofa.obj" => (Vec3::new(1.6, 0.55, 0.75), 0.0),
        "sideTable.obj" => (Vec3::new(0.45, 0.35, 0.45), 0.0),
        _ => (Vec3::new(1.0, 0.5, 1.0), 0.0),
    }
}

fn finalize_loaded_obj_props(
    mut commands: Commands,
    obj_meshes: Res<Assets<ObjMesh>>,
    pending: Query<(Entity, &PendingObjProp, &ObjPropHandle)>,
    mut meshes: ResMut<Assets<Mesh>>,
) {
    for (entity, pending_prop, obj_handle) in &pending {
        let Some(obj) = obj_meshes.get(&obj_handle.0) else {
            continue;
        };

        commands.entity(pending_prop.fallback).despawn();
        commands.entity(entity).insert((
            Mesh3d(meshes.add(obj.0.clone())),
            MeshMaterial3d(pending_prop.material.clone()),
            pending_prop.transform,
            Visibility::default(),
        ));
        commands
            .entity(entity)
            .remove::<PendingObjProp>()
            .remove::<ObjPropHandle>();
    }
}
