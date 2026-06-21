//! Consume `RoomSnapshot.spawn_queue` and spawn generated/stretch props (Track H4).
//!
//! `room-state` polling delivers a `spawn_queue` of generated assets (props,
//! clothing, furniture). Each entry carries an `AssetRenderSpec` describing how
//! Bevy should draw it. This system spawns a primitive mesh per `ready` entry and
//! records the `asset_id` so the repeated 500ms polls never duplicate meshes.

use std::collections::HashSet;

use bevy::prelude::*;
use protocol::{AssetRenderSpec, AssetStatus, PrimitiveShape};

use crate::bridge::{BridgeSet, LatestRoomSnapshot};
use crate::manifest::parse_hex_color;
use crate::world::protocol_to_world;

/// Default neutral color when an entry omits an explicit hex color.
const DEFAULT_COLOR: Color = Color::srgb(0.72, 0.72, 0.78);

/// Tracks `spawn_queue` entries already spawned, keyed by `asset_id`, so repeated
/// room-state polls are idempotent (no duplicate spawns, no per-frame churn).
#[derive(Resource, Default)]
pub struct SpawnedAssets(HashSet<String>);

/// Marker for meshes spawned from a `spawn_queue` entry.
#[derive(Component, Debug)]
pub struct SpawnedAsset {
    pub asset_id: String,
}

pub struct SpawnQueuePlugin;

impl Plugin for SpawnQueuePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<SpawnedAssets>()
            .add_systems(Update, consume_spawn_queue.after(BridgeSet));
    }
}

fn consume_spawn_queue(
    latest: Res<LatestRoomSnapshot>,
    mut spawned: ResMut<SpawnedAssets>,
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    if !latest.is_changed() {
        return;
    }
    let Some(snapshot) = latest.0.as_ref() else {
        return;
    };

    for entry in &snapshot.spawn_queue {
        // Only spawn assets the backend marked ready. Generating/failed entries are
        // skipped *without* being recorded, so they can still spawn once they flip
        // to `ready` on a later poll.
        if entry.status != AssetStatus::Ready {
            continue;
        }
        if spawned.0.contains(&entry.asset_id) {
            continue;
        }

        let (mesh, color, y_offset) = match &entry.render {
            AssetRenderSpec::Primitive {
                shape,
                color,
                width,
                height,
                depth,
                ..
            } => build_primitive(*shape, *width, *height, *depth, color.as_deref()),
            // Runtime glTF loading for generated assets is out of scope (H4); spawn a
            // neutral placeholder cuboid so the prop is still visible rather than failing.
            AssetRenderSpec::Gltf { .. } => placeholder_primitive(),
        };

        let mesh_handle = meshes.add(mesh);
        let material = materials.add(StandardMaterial {
            base_color: color,
            ..default()
        });
        let translation = protocol_to_world(entry.x, entry.y) + Vec3::new(0.0, y_offset, 0.0);

        commands.spawn((
            SpawnedAsset {
                asset_id: entry.asset_id.clone(),
            },
            Mesh3d(mesh_handle),
            MeshMaterial3d(material),
            Transform::from_translation(translation),
            Visibility::default(),
        ));

        spawned.0.insert(entry.asset_id.clone());
        log::info!(
            "spawn_queue: spawned asset {} ({})",
            entry.asset_id,
            entry.description
        );
    }
}

/// Map a protocol `PrimitiveShape` + dimensions to a Bevy mesh, color, and the
/// vertical offset that rests the mesh on the floor (y = 0).
fn build_primitive(
    shape: PrimitiveShape,
    width: Option<f32>,
    height: Option<f32>,
    depth: Option<f32>,
    color: Option<&str>,
) -> (Mesh, Color, f32) {
    let color = color.map(parse_hex_color).unwrap_or(DEFAULT_COLOR);
    match shape {
        PrimitiveShape::Cuboid => {
            let w = width.unwrap_or(1.0).max(0.01);
            let h = height.unwrap_or(1.0).max(0.01);
            let d = depth.unwrap_or(1.0).max(0.01);
            (Cuboid::new(w, h, d).into(), color, h * 0.5)
        }
        PrimitiveShape::Sphere => {
            // Diameter conveyed via `width` (fall back to `height`).
            let radius = (width.or(height).unwrap_or(1.0).max(0.01)) * 0.5;
            (Sphere::new(radius).into(), color, radius)
        }
        PrimitiveShape::Capsule => {
            let radius = (width.unwrap_or(0.7).max(0.01)) * 0.5;
            let length = height.unwrap_or(1.0).max(0.01);
            (Capsule3d::new(radius, length).into(), color, radius + length * 0.5)
        }
    }
}

fn placeholder_primitive() -> (Mesh, Color, f32) {
    (Cuboid::new(0.8, 0.8, 0.8).into(), DEFAULT_COLOR, 0.4)
}
