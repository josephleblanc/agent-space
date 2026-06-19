//! Shared JSON contract between Bevy WASM, InsForge edge functions, and the JS shell.
//!
//! Track B owns this crate; all other tracks must import these types rather than
//! inventing alternate shapes.

use serde::{Deserialize, Serialize};

/// Agent activity state mirrored in the 3D scene and edge-function responses.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AgentState {
    Idle,
    Walking,
    Working,
    Talking,
}

/// Lifecycle of a task row in Postgres / room-state payloads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    Active,
    Completed,
    Failed,
}

/// Full room view returned by `room-state` and consumed by Bevy + `api-client.js`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RoomSnapshot {
    pub agents: Vec<AgentSnapshot>,
    pub tasks: Vec<TaskSnapshot>,
}

/// One agent's pose and state inside the hangout room.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentSnapshot {
    pub id: String,
    pub name: String,
    pub role: String,
    pub state: AgentState,
    pub station_id: Option<String>,
    pub x: f32,
    pub y: f32,
    pub backend: String,
}

/// A persisted or in-flight task visible in room-state polling.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TaskSnapshot {
    pub id: String,
    pub agent_id: String,
    #[serde(rename = "type")]
    pub task_type: String,
    pub station: String,
    pub status: TaskStatus,
}

/// Optional task emitted by an agent turn (Nebius structured output / Vapi tools).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TaskAction {
    #[serde(rename = "type")]
    pub task_type: String,
    pub station: String,
}

/// Structured reply from `agent-chat` after an agent reasons about a request.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentTurn {
    pub speech: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task: Option<TaskAction>,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_room() -> RoomSnapshot {
        RoomSnapshot {
            agents: vec![AgentSnapshot {
                id: "agent-researcher".into(),
                name: "Researcher".into(),
                role: "research".into(),
                state: AgentState::Walking,
                station_id: Some("bench".into()),
                x: 1.5,
                y: -2.0,
                backend: "nebius".into(),
            }],
            tasks: vec![TaskSnapshot {
                id: "task-1".into(),
                agent_id: "agent-researcher".into(),
                task_type: "research".into(),
                station: "bench".into(),
                status: TaskStatus::Active,
            }],
        }
    }

    #[test]
    fn agent_state_serializes_snake_case() {
        let json = serde_json::to_string(&AgentState::Working).unwrap();
        assert_eq!(json, "\"working\"");
    }

    #[test]
    fn task_action_uses_type_key() {
        let action = TaskAction {
            task_type: "code".into(),
            station: "desk".into(),
        };
        let value: serde_json::Value = serde_json::to_value(&action).unwrap();
        assert_eq!(value["type"], "code");
        assert_eq!(value["station"], "desk");
    }

    #[test]
    fn room_snapshot_round_trip() {
        let snapshot = sample_room();
        let json = serde_json::to_string(&snapshot).unwrap();
        let parsed: RoomSnapshot = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, snapshot);
    }

    #[test]
    fn agent_turn_round_trip_with_optional_task() {
        let turn = AgentTurn {
            speech: "On my way to the bench.".into(),
            task: Some(TaskAction {
                task_type: "research".into(),
                station: "bench".into(),
            }),
        };
        let json = serde_json::to_string(&turn).unwrap();
        let parsed: AgentTurn = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, turn);
    }

    #[test]
    fn agent_turn_omits_null_task_on_parse() {
        let json = r#"{"speech":"Hello!"}"#;
        let parsed: AgentTurn = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.speech, "Hello!");
        assert!(parsed.task.is_none());
    }
}
