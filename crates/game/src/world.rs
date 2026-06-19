//! Shared world-space helpers.

use bevy::prelude::*;

pub const FLOOR_Y: f32 = 0.0;

/// Matches web shell `--viewport-aspect: 16 / 10`.
pub const VIEWPORT_ASPECT: f32 = 16.0 / 10.0;
pub const ORTHO_VIEWPORT_HEIGHT: f32 = 12.0;

/// Map protocol / DB floor coordinates (x, y) to Bevy world space.
pub fn protocol_to_world(x: f32, y: f32) -> Vec3 {
    Vec3::new(x, FLOOR_Y, y)
}

/// Clamp a world XZ position inside walkable floor bounds.
pub fn clamp_to_room(position: Vec3, half_width: f32, half_depth: f32) -> Vec3 {
    let margin = 0.75;
    Vec3::new(
        position.x.clamp(-half_width + margin, half_width - margin),
        position.y,
        position.z.clamp(-half_depth + margin, half_depth - margin),
    )
}

/// Snap world position to grid cell center.
pub fn snap_to_grid(position: Vec3, cell_size: f32) -> Vec3 {
    Vec3::new(
        (position.x / cell_size).round() * cell_size,
        position.y,
        (position.z / cell_size).round() * cell_size,
    )
}

/// Convert world XZ to integer grid coordinates.
pub fn world_to_grid(position: Vec3, cell_size: f32) -> IVec2 {
    IVec2::new(
        (position.x / cell_size).round() as i32,
        (position.z / cell_size).round() as i32,
    )
}

/// Convert grid coordinates back to world XZ.
pub fn grid_to_world(cell: IVec2, cell_size: f32, y: f32) -> Vec3 {
    Vec3::new(cell.x as f32 * cell_size, y, cell.y as f32 * cell_size)
}
