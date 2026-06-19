/**
 * TypeScript mirror of `crates/protocol` — the frozen JSON contract for all tracks.
 * Keep field names and enum values in sync with the Rust serde definitions.
 */

export type AgentState = "idle" | "walking" | "working" | "talking";

export type TaskStatus = "pending" | "active" | "completed" | "failed";

export interface TaskAction {
  type: string;
  station: string;
}

export interface AgentTurn {
  speech: string;
  task?: TaskAction | null;
}

export interface AgentSnapshot {
  id: string;
  name: string;
  role: string;
  state: AgentState;
  station_id: string | null;
  x: number;
  y: number;
  backend: string;
}

export interface TaskSnapshot {
  id: string;
  agent_id: string;
  type: string;
  station: string;
  status: TaskStatus;
}

export interface RoomSnapshot {
  agents: AgentSnapshot[];
  tasks: TaskSnapshot[];
}
