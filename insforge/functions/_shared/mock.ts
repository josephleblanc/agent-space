/**
 * In-memory seed snapshot used when Postgres is unavailable (local dev without login).
 * Mirrors insforge/seed.sql so room-state returns a valid RoomSnapshot offline.
 */

import type { RoomSnapshot } from "./protocol.ts";

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
