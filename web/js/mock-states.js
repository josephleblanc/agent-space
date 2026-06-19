/**
 * Dev mock RoomSnapshot presets (Track B6).
 * Shapes mirror insforge/functions/_shared/mock.ts and crates/protocol.
 */

/** @typedef {import("./api-client.js").RoomSnapshot} RoomSnapshot */

/** @type {RoomSnapshot} */
export const MOCK_IDLE = {
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

/** @type {RoomSnapshot} */
export const MOCK_WALKING = {
  agents: MOCK_IDLE.agents.map((agent) => ({
    ...agent,
    state: "walking",
  })),
  tasks: [],
};

/** @type {RoomSnapshot} */
export const MOCK_RESEARCHER_WORKING = {
  agents: MOCK_IDLE.agents.map((agent) =>
    agent.id === "agent-researcher"
      ? { ...agent, state: "working", station_id: "research" }
      : agent,
  ),
  tasks: [
    {
      id: "task-dev-1",
      agent_id: "agent-researcher",
      type: "research",
      station: "research",
      status: "active",
    },
  ],
};

/** @type {RoomSnapshot} */
export const MOCK_MIXED_ACTIVITY = {
  agents: [
    { ...MOCK_IDLE.agents[0], state: "talking" },
    { ...MOCK_IDLE.agents[1], state: "working", station_id: "code" },
    { ...MOCK_IDLE.agents[2], state: "walking", station_id: "meet" },
    { ...MOCK_IDLE.agents[3], state: "idle" },
  ],
  tasks: [
    {
      id: "task-dev-2",
      agent_id: "agent-coder",
      type: "code",
      station: "code",
      status: "active",
    },
  ],
};

/** @type {Record<string, RoomSnapshot>} */
export const MOCK_PRESETS = {
  idle: MOCK_IDLE,
  walking: MOCK_WALKING,
  working: MOCK_RESEARCHER_WORKING,
  mixed: MOCK_MIXED_ACTIVITY,
};
