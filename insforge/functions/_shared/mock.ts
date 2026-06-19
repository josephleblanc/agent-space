/**
 * In-memory seed snapshot used when Postgres is unavailable (local dev without login).
 * Mirrors insforge/seed.sql so room-state returns a valid RoomSnapshot offline.
 */

import type { AgentSnapshot, AgentState, RoomSnapshot, TaskSnapshot } from "./protocol.ts";

export const MOCK_ROOM_SNAPSHOT: RoomSnapshot = {
  agents: [
    {
      id: "agent-researcher",
      name: "Researcher",
      role: "researcher",
      state: "idle",
      station_id: "research",
      x: -3.0,
      y: 2.5,
      backend: "nebius",
    },
    {
      id: "agent-coder",
      name: "Coder",
      role: "coder",
      state: "idle",
      station_id: "code",
      x: 3.0,
      y: 2.5,
      backend: "nebius",
    },
    {
      id: "agent-planner",
      name: "Planner",
      role: "planner",
      state: "idle",
      station_id: "meet",
      x: 0.0,
      y: -2.0,
      backend: "nebius",
    },
    {
      id: "agent-social",
      name: "Social",
      role: "social",
      state: "idle",
      station_id: "lounge",
      x: -3.0,
      y: -2.5,
      backend: "nebius",
    },
  ],
  tasks: [],
};

/** Mutable offline room state — updated by agent-chat / vapi-webhook when no DB. */
let mockSnapshot: RoomSnapshot = structuredClone(MOCK_ROOM_SNAPSHOT);

export function getMockRoomSnapshot(): RoomSnapshot {
  return mockSnapshot;
}

export function resetMockRoomSnapshot(): void {
  mockSnapshot = structuredClone(MOCK_ROOM_SNAPSHOT);
}

export function updateMockAgent(
  agentId: string,
  updates: Partial<Pick<AgentSnapshot, "state" | "station_id">>,
  allowedFromStates?: AgentState[],
): boolean {
  const agent = mockSnapshot.agents.find((a) => a.id === agentId);
  if (!agent) return false;

  if (allowedFromStates && !allowedFromStates.includes(agent.state)) {
    return false;
  }

  if (updates.state !== undefined) agent.state = updates.state;
  if (updates.station_id !== undefined) {
    agent.station_id = updates.station_id;
  }
  return true;
}

export function addMockTask(
  agentId: string,
  type: string,
  station: string,
  status: TaskSnapshot["status"] = "active",
): TaskSnapshot {
  const task: TaskSnapshot = {
    id: `task-mock-${crypto.randomUUID()}`,
    agent_id: agentId,
    type,
    station,
    status,
  };
  mockSnapshot.tasks = [
    task,
    ...mockSnapshot.tasks.filter((t) => t.agent_id !== agentId || t.status !== "active"),
  ];
  return task;
}
