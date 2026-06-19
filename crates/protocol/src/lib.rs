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

/// Asset category for stretch goal on-demand generation (Track H).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    Prop,
    Clothing,
    Furniture,
}

/// Lifecycle of a generated asset row / spawn-queue entry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssetStatus {
    Generating,
    Ready,
    Failed,
}

/// Primitive mesh shape for MVP textured-props (before full glTF pipeline).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PrimitiveShape {
    Cuboid,
    Sphere,
    Capsule,
}

/// How Bevy should render a spawn-queue asset (primitive MVP vs future glTF).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum AssetRenderSpec {
    Primitive {
        shape: PrimitiveShape,
        #[serde(skip_serializing_if = "Option::is_none")]
        texture_url: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        color: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        width: Option<f32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        height: Option<f32>,
        #[serde(skip_serializing_if = "Option::is_none")]
        depth: Option<f32>,
    },
    Gltf {
        url: String,
    },
}

/// Pending world prop/clothing spawn delivered via `room-state` polling (Track H).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SpawnQueueEntry {
    pub asset_id: String,
    pub kind: AssetKind,
    pub description: String,
    pub status: AssetStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_by: Option<String>,
    pub render: AssetRenderSpec,
    pub x: f32,
    pub y: f32,
}

/// Full room view returned by `room-state` and consumed by Bevy + `api-client.js`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RoomSnapshot {
    pub agents: Vec<AgentSnapshot>,
    pub tasks: Vec<TaskSnapshot>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub spawn_queue: Vec<SpawnQueueEntry>,
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
            spawn_queue: vec![],
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

    #[test]
    fn spawn_queue_entry_round_trip() {
        let entry = SpawnQueueEntry {
            asset_id: "asset-1".into(),
            kind: AssetKind::Prop,
            description: "whiteboard".into(),
            status: AssetStatus::Ready,
            requested_by: Some("agent-researcher".into()),
            render: AssetRenderSpec::Primitive {
                shape: PrimitiveShape::Cuboid,
                texture_url: None,
                color: Some("#ffffff".into()),
                width: Some(1.2),
                height: Some(0.9),
                depth: Some(0.05),
            },
            x: 0.0,
            y: 0.0,
        };
        let json = serde_json::to_string(&entry).unwrap();
        let parsed: SpawnQueueEntry = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, entry);
    }

    #[test]
    fn room_snapshot_backward_compat_without_spawn_queue() {
        let json = r#"{"agents":[],"tasks":[]}"#;
        let parsed: RoomSnapshot = serde_json::from_str(json).unwrap();
        assert!(parsed.spawn_queue.is_empty());
    }
}
