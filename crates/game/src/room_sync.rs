//! Apply protocol room snapshots to agent entities (Track A16).

use bevy::prelude::*;
use protocol::AgentState;

use crate::agent::Agent;
use crate::bridge::{AgentSpeechEvent, BridgeSet, BridgeSyncActive, LatestRoomSnapshot};
use crate::movement::MovementPath;
use crate::world::protocol_to_world;

pub struct RoomSyncPlugin;

impl Plugin for RoomSyncPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(
            Update,
            (sync_agents_from_snapshot, apply_agent_speech).after(BridgeSet),
        );
    }
}

fn sync_agents_from_snapshot(
    latest: Res<LatestRoomSnapshot>,
    mut bridge_active: ResMut<BridgeSyncActive>,
    mut commands: Commands,
    mut agents: Query<(Entity, &mut Agent, &Transform)>,
) {
    if !latest.is_changed() {
        return;
    }
    let Some(snapshot) = latest.0.as_ref() else {
        return;
    };
    bridge_active.0 = true;
    for snap in &snapshot.agents {
        for (entity, mut agent, _transform) in &mut agents {
            if agent.id != snap.id {
                continue;
            }
            agent.name = snap.name.clone();
            agent.role = snap.role.clone();
            agent.backend = snap.backend.clone();
            agent.station_id = snap.station_id.clone();
            if agent.state != snap.state {
                agent.set_state(snap.state);
            }
            commands
                .entity(entity)
                .insert(Transform::from_translation(protocol_to_world(snap.x, snap.y)));
            if snap.state != AgentState::Walking {
                commands.entity(entity).remove::<MovementPath>();
            }
        }
    }
}

fn apply_agent_speech(
    mut events: MessageReader<AgentSpeechEvent>,
    mut agents: Query<&mut Agent>,
) {
    for event in events.read() {
        for mut agent in &mut agents {
            if agent.id == event.agent_id {
                agent.set_state(AgentState::Talking);
            }
        }
    }
}
