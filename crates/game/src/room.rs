//! Floor and perimeter walls (A8).

use bevy::prelude::*;

use crate::world::FLOOR_Y;

pub const ROOM_WIDTH: f32 = 18.0;
pub const ROOM_DEPTH: f32 = 14.0;
pub const WALL_HEIGHT: f32 = 3.0;
pub const WALL_THICKNESS: f32 = 0.25;

pub struct RoomPlugin;

impl Plugin for RoomPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_room);
    }
}

fn spawn_room(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let floor_material = materials.add(StandardMaterial {
        base_color: Color::srgb(0.22, 0.24, 0.28),
        perceptual_roughness: 0.9,
        ..default()
    });
    let wall_material = materials.add(StandardMaterial {
        base_color: Color::srgb(0.32, 0.34, 0.38),
        perceptual_roughness: 0.85,
        ..default()
    });

    commands.spawn((
        Mesh3d(meshes.add(Plane3d::default().mesh().size(ROOM_WIDTH, ROOM_DEPTH))),
        MeshMaterial3d(floor_material),
        Transform::from_xyz(0.0, FLOOR_Y, 0.0),
    ));

    let half_w = ROOM_WIDTH * 0.5;
    let half_d = ROOM_DEPTH * 0.5;
    let wall_y = FLOOR_Y + WALL_HEIGHT * 0.5;

    spawn_wall(
        &mut commands,
        &mut meshes,
        wall_material.clone(),
        Vec3::new(0.0, wall_y, -half_d),
        Vec3::new(ROOM_WIDTH, WALL_HEIGHT, WALL_THICKNESS),
    );
    spawn_wall(
        &mut commands,
        &mut meshes,
        wall_material.clone(),
        Vec3::new(0.0, wall_y, half_d),
        Vec3::new(ROOM_WIDTH, WALL_HEIGHT, WALL_THICKNESS),
    );
    spawn_wall(
        &mut commands,
        &mut meshes,
        wall_material.clone(),
        Vec3::new(-half_w, wall_y, 0.0),
        Vec3::new(WALL_THICKNESS, WALL_HEIGHT, ROOM_DEPTH),
    );
    spawn_wall(
        &mut commands,
        &mut meshes,
        wall_material,
        Vec3::new(half_w, wall_y, 0.0),
        Vec3::new(WALL_THICKNESS, WALL_HEIGHT, ROOM_DEPTH),
    );
}

fn spawn_wall(
    commands: &mut Commands,
    meshes: &mut ResMut<Assets<Mesh>>,
    material: Handle<StandardMaterial>,
    position: Vec3,
    size: Vec3,
) {
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::from_size(size))),
        MeshMaterial3d(material),
        Transform::from_translation(position),
    ));
}
