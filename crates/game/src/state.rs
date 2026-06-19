//! A13 — agent state transitions derived from movement progress.

use bevy::prelude::*;
use protocol::AgentState;

use crate::agent::Agent;
use crate::movement::{MovementPath, ARRIVAL_EPSILON};

pub fn update_agent_states(
    mut agents: Query<(&mut Agent, Option<&MovementPath>, &Transform)>,
) {
    for (mut agent, movement, transform) in &mut agents {
        if agent.state == AgentState::Talking {
            continue;
        }

        let next = if let Some(path) = movement {
            if let Some(target) = path.waypoints.get(path.index) {
                if transform.translation.distance(*target) > ARRIVAL_EPSILON {
                    AgentState::Walking
                } else if path.destination_station.is_some() {
                    AgentState::Working
                } else {
                    AgentState::Idle
                }
            } else {
                AgentState::Idle
            }
        } else if agent.state == AgentState::Working {
            AgentState::Working
        } else {
            AgentState::Idle
        };

        if agent.state != next {
            agent.state = next;
        }
    }
}
