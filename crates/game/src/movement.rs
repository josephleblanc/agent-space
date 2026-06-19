//! Grid pathing and agent locomotion toward station targets (A14).

use bevy::prelude::*;
use protocol::AgentState;

use crate::agent::Agent;
use crate::room::{ROOM_DEPTH, ROOM_WIDTH};
use crate::station::StationLayout;
use crate::world::{clamp_to_room, grid_to_world, snap_to_grid, world_to_grid, FLOOR_Y};

pub const GRID_CELL: f32 = 0.5;
pub const MOVE_SPEED: f32 = 2.8;
pub const ARRIVAL_EPSILON: f32 = 0.08;
pub const ROTATION_SPEED: f32 = 8.0;

#[derive(Component, Debug, Clone)]
pub struct MovementPath {
    pub waypoints: Vec<Vec3>,
    pub index: usize,
    pub destination_station: Option<String>,
}

impl MovementPath {
    fn current(&self) -> Option<Vec3> {
        self.waypoints.get(self.index).copied()
    }

    fn advance(&mut self) -> bool {
        if self.index + 1 < self.waypoints.len() {
            self.index += 1;
            true
        } else {
            false
        }
    }
}

pub fn movement_path_to(from: Vec3, to: Vec3) -> MovementPath {
    MovementPath {
        waypoints: plan_path(from, to),
        index: 0,
        destination_station: None,
    }
}

pub fn movement_path_to_station(from: Vec3, station_id: &str, layout: &StationLayout) -> Option<MovementPath> {
    let dest = layout.work_position(station_id)?;
    Some(MovementPath {
        waypoints: plan_path(from, dest),
        index: 0,
        destination_station: Some(station_id.to_string()),
    })
}

pub fn plan_path(from: Vec3, to: Vec3) -> Vec<Vec3> {
    let half_w = ROOM_WIDTH * 0.5;
    let half_d = ROOM_DEPTH * 0.5;
    let from = clamp_to_room(snap_to_grid(from, GRID_CELL), half_w, half_d);
    let to = clamp_to_room(snap_to_grid(to, GRID_CELL), half_w, half_d);
    let start = world_to_grid(from, GRID_CELL);
    let goal = world_to_grid(to, GRID_CELL);
    if start == goal {
        return vec![to];
    }
    let mut path = Vec::new();
    let mut cursor = start;
    while cursor.x != goal.x {
        cursor.x += (goal.x - cursor.x).signum();
        path.push(grid_to_world(cursor, GRID_CELL, FLOOR_Y));
    }
    while cursor.y != goal.y {
        cursor.y += (goal.y - cursor.y).signum();
        path.push(grid_to_world(cursor, GRID_CELL, FLOOR_Y));
    }
    if path.last().copied() != Some(to) {
        path.push(to);
    }
    path
}

pub fn assign_paths_for_walking_agents(
    layout: Res<StationLayout>,
    mut commands: Commands,
    agents: Query<(Entity, &Agent, &Transform), (Changed<Agent>, Without<MovementPath>)>,
) {
    for (entity, agent, transform) in &agents {
        if agent.state != AgentState::Walking {
            continue;
        }
        let Some(station_id) = agent.station_id.as_deref() else {
            continue;
        };
        let Some(path) = movement_path_to_station(transform.translation, station_id, &layout) else {
            continue;
        };
        commands.entity(entity).insert(path);
    }
}

pub fn agent_movement(
    time: Res<Time>,
    mut commands: Commands,
    mut agents: Query<(Entity, &mut Agent, &mut Transform, Option<&mut MovementPath>)>,
) {
    let dt = time.delta_secs();
    for (entity, mut agent, mut transform, movement) in &mut agents {
        if agent.state != AgentState::Walking {
            if movement.is_some() {
                commands.entity(entity).remove::<MovementPath>();
            }
            continue;
        }
        let Some(mut movement) = movement else {
            continue;
        };
        let Some(target) = movement.current() else {
            finish_walking(&mut agent, &movement);
            commands.entity(entity).remove::<MovementPath>();
            continue;
        };
        let pos = transform.translation;
        let flat = Vec3::new(target.x - pos.x, 0.0, target.z - pos.z);
        let distance = flat.length();
        if distance <= ARRIVAL_EPSILON {
            if movement.advance() {
                continue;
            }
            transform.translation = Vec3::new(target.x, FLOOR_Y, target.z);
            finish_walking(&mut agent, &movement);
            commands.entity(entity).remove::<MovementPath>();
            continue;
        }
        let step = (MOVE_SPEED * dt).min(distance);
        let direction = flat.normalize();
        transform.translation += direction * step;
        transform.translation.y = FLOOR_Y;
        if direction.length_squared() > 0.001 {
            let facing = Quat::from_rotation_y(direction.x.atan2(direction.z));
            transform.rotation = transform
                .rotation
                .slerp(facing, (ROTATION_SPEED * dt).min(1.0));
        }
    }
}

fn finish_walking(agent: &mut Agent, movement: &MovementPath) {
    if let Some(station) = &movement.destination_station {
        agent.station_id = Some(station.clone());
    }
    agent.state = AgentState::Working;
}

pub struct MovementPlugin;

impl Plugin for MovementPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(
            Update,
            (
                assign_paths_for_walking_agents,
                agent_movement,
            )
                .chain(),
        );
    }
}
