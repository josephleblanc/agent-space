//! Room shell: floor plane and four walls (A8).

use bevy::prelude::*;

const ROOM_WIDTH: f32 = 16.0;
const ROOM_DEPTH: f32 = 12.0;
const WALL_HEIGHT: f32 = 3.0;
const WALL_THICKNESS: f32 = 0.25;

pub fn spawn_room(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    let floor_material = materials.add(StandardMaterial {
        base_color: Color::srgb(0.32, 0.34, 0.38),
        perceptual_roughness: 0.95,
        ..default()
    });

    commands.spawn((
        Mesh3d(meshes.add(Plane3d::default().mesh().size(ROOM_WIDTH, ROOM_DEPTH))),
        MeshMaterial3d(floor_material),
        Transform::IDENTITY,
    ));

    let wall_material = materials.add(StandardMaterial {
        base_color: Color::srgb(0.55, 0.58, 0.64),
        perceptual_roughness: 0.9,
        ..default()
    });

    let half_w = ROOM_WIDTH * 0.5;
    let half_d = ROOM_DEPTH * 0.5;
    let wall_y = WALL_HEIGHT * 0.5;

    spawn_wall(
        &mut commands,
        &mut meshes,
        &wall_material,
        Vec3::new(0.0, wall_y, -half_d),
        Vec3::new(ROOM_WIDTH, WALL_HEIGHT, WALL_THICKNESS),
    );
    spawn_wall(
        &mut commands,
        &mut meshes,
        &wall_material,
        Vec3::new(0.0, wall_y, half_d),
        Vec3::new(ROOM_WIDTH, WALL_HEIGHT, WALL_THICKNESS),
    );
    spawn_wall(
        &mut commands,
        &mut meshes,
        &wall_material,
        Vec3::new(-half_w, wall_y, 0.0),
        Vec3::new(WALL_THICKNESS, WALL_HEIGHT, ROOM_DEPTH),
    );
    spawn_wall(
        &mut commands,
        &mut meshes,
        &wall_material,
        Vec3::new(half_w, wall_y, 0.0),
        Vec3::new(WALL_THICKNESS, WALL_HEIGHT, ROOM_DEPTH),
    );
}

fn spawn_wall(
    commands: &mut Commands,
    meshes: &mut ResMut<Assets<Mesh>>,
    material: &Handle<StandardMaterial>,
    position: Vec3,
    size: Vec3,
) {
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::from_size(size))),
        MeshMaterial3d(material.clone()),
        Transform::from_translation(position),
    ));
}
