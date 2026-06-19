//! Room lighting setup (A7).

use bevy::{light::CascadeShadowConfigBuilder, prelude::*};

pub struct LightingPlugin;

impl Plugin for LightingPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(GlobalAmbientLight {
            color: Color::srgb(0.85, 0.88, 0.95),
            brightness: 120.0,
            ..default()
        })
        .add_systems(Startup, spawn_lights);
    }
}

fn spawn_lights(mut commands: Commands) {
    commands.spawn((
        Transform::from_rotation(Quat::from_euler(EulerRot::XYZ, -0.9, 0.6, 0.0)),
        DirectionalLight {
            illuminance: 12_000.0,
            shadows_enabled: true,
            ..default()
        },
        CascadeShadowConfigBuilder {
            first_cascade_far_bound: 8.0,
            maximum_distance: 24.0,
            ..default()
        }
        .build(),
    ));

    commands.spawn((
        PointLight {
            intensity: 400_000.0,
            range: 18.0,
            shadows_enabled: false,
            ..default()
        },
        Transform::from_xyz(0.0, 6.0, 0.0),
    ));
}
