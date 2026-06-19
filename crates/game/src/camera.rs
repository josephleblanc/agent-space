//! Fixed isometric orthographic camera with 16:10 letterboxed viewport.

use bevy::camera::{ScalingMode, Viewport};
use bevy::prelude::*;

use crate::world::{VIEWPORT_ASPECT, FLOOR_Y};

const ORTHO_VIEWPORT_HEIGHT: f32 = 14.0;

#[derive(Component)]
pub struct MainCamera;

pub struct CameraPlugin;

impl Plugin for CameraPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Startup, spawn_camera)
            .add_systems(Update, update_letterbox_viewport);
    }
}

fn spawn_camera(mut commands: Commands) {
    let iso_dir = Vec3::new(1.0, 1.0, 1.0).normalize();
    let distance = 18.0;
    let look_target = Vec3::new(0.0, FLOOR_Y, 0.0);

    commands.spawn((
        MainCamera,
        Camera3d::default(),
        Camera::default(),
        Projection::from(OrthographicProjection {
            scaling_mode: ScalingMode::FixedVertical {
                viewport_height: ORTHO_VIEWPORT_HEIGHT,
            },
            ..OrthographicProjection::default_3d()
        }),
        Transform::from_translation(iso_dir * distance).looking_at(look_target, Vec3::Y),
    ));
}

fn update_letterbox_viewport(
    window: Query<&Window>,
    mut cameras: Query<&mut Camera, With<MainCamera>>,
) {
    let Ok(window) = window.single() else {
        return;
    };
    let Ok(mut camera) = cameras.single_mut() else {
        return;
    };

    let scale = window.resolution.scale_factor();
    let physical_width = (window.resolution.width() * scale).round() as u32;
    let physical_height = (window.resolution.height() * scale).round() as u32;

    if physical_width == 0 || physical_height == 0 {
        return;
    }

    let window_aspect = physical_width as f32 / physical_height as f32;

    let (vp_width, vp_height) = if window_aspect > VIEWPORT_ASPECT {
        let vp_height = physical_height;
        let vp_width = (physical_height as f32 * VIEWPORT_ASPECT).round() as u32;
        (vp_width, vp_height)
    } else {
        let vp_width = physical_width;
        let vp_height = (physical_width as f32 / VIEWPORT_ASPECT).round() as u32;
        (vp_width, vp_height)
    };

    let x = (physical_width.saturating_sub(vp_width)) / 2;
    let y = (physical_height.saturating_sub(vp_height)) / 2;

    camera.viewport = Some(Viewport {
        physical_position: UVec2::new(x, y),
        physical_size: UVec2::new(vp_width, vp_height),
        ..default()
    });
}
