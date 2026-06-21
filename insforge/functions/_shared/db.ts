/**
 * InsForge database client and room-state query helpers.
 *
 * Deployed edge functions receive INSFORGE_BASE_URL and ANON_KEY automatically.
 * For privileged writes (tasks, agent state), prefer SERVICE_ROLE_KEY when set.
 */

// Version is pinned in deno.json's import map (npm:@insforge/sdk@1.4.2).
import { createClient, type InsForgeClient } from "@insforge/sdk";
import type {
  AgentSnapshot,
  AgentState,
  AgentTurn,
  AssetKind,
  AssetRenderSpec,
  AssetStatus,
  PrimitiveShape,
  RoomSnapshot,
  SpawnQueueEntry,
  TaskAction,
  TaskSnapshot,
} from "./protocol.ts";
import {
  addMockSpawnEntry,
  addMockTask,
  getMockRoomSnapshot,
  getMockSpawnQueue,
  updateMockAgent,
} from "./mock.ts";
import { AgentBusyError } from "./concurrency.ts";

export function getDbClient(): InsForgeClient | null {
  const baseUrl = Deno.env.get("INSFORGE_BASE_URL") ??
    Deno.env.get("VITE_INSFORGE_URL");
  const anonKey = Deno.env.get("ANON_KEY") ??
    Deno.env.get("VITE_INSFORGE_ANON_KEY");
  const serviceKey = Deno.env.get("SERVICE_ROLE_KEY");

  if (!baseUrl) {
    return null;
  }

  return createClient({
    baseUrl,
    anonKey: serviceKey ?? anonKey ?? undefined,
  });
}

export function isDbConfigured(): boolean {
  return getDbClient() !== null;
}

interface AgentRow {
  id: string;
  name: string;
  role: string;
  state: string;
  station_id: string | null;
  x: number;
  y: number;
  backend: string;
}

interface TaskRow {
  id: string;
  agent_id: string;
  type: string;
  station: string;
  status: string;
}

interface AssetRow {
  id: string;
  kind: string;
  description: string;
  storage_url: string | null;
  gltf_path: string | null;
  requested_by: string | null;
  status: string;
}

function mapAgent(row: AgentRow): AgentSnapshot {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    state: row.state as AgentSnapshot["state"],
    station_id: row.station_id,
    x: Number(row.x),
    y: Number(row.y),
    backend: row.backend,
  };
}

function mapTask(row: TaskRow): TaskSnapshot {
  return {
    id: row.id,
    agent_id: row.agent_id,
    type: row.type,
    station: row.station,
    status: row.status as TaskSnapshot["status"],
  };
}

/** Load room snapshot from Postgres, or null if the client/query fails. */
export async function fetchRoomSnapshot(): Promise<RoomSnapshot | null> {
  const client = getDbClient();
  if (!client) {
    return null;
  }

  const [agentsResult, tasksResult] = await Promise.all([
    client.database.from("agents").select("*").order("id"),
    client.database
      .from("tasks")
      .select("*")
      .in("status", ["pending", "active"])
      .order("created_at", { ascending: false }),
  ]);

  if (agentsResult.error || tasksResult.error) {
    console.error("fetchRoomSnapshot failed", {
      agents: agentsResult.error,
      tasks: tasksResult.error,
    });
    return null;
  }

  if (!agentsResult.data?.length) {
    return null;
  }

  return {
    agents: (agentsResult.data as AgentRow[]).map(mapAgent),
    tasks: ((tasksResult.data ?? []) as TaskRow[]).map(mapTask),
    spawn_queue: await fetchSpawnQueue(),
  };
}

/** DB when configured, otherwise the mutable mock snapshot for local/offline dev. */
export async function getRoomSnapshot(): Promise<RoomSnapshot> {
  const fromDb = await fetchRoomSnapshot();
  if (fromDb) return fromDb;

  const mock = getMockRoomSnapshot();
  return {
    ...mock,
    spawn_queue: getMockSpawnQueue(),
  };
}

export async function getAgentById(
  agentId: string,
): Promise<AgentSnapshot | null> {
  const snapshot = await getRoomSnapshot();
  return snapshot.agents.find((a) => a.id === agentId) ?? null;
}

export async function insertMessage(
  agentId: string,
  role: "user" | "assistant" | "system",
  content: string,
): Promise<void> {
  const client = getDbClient();
  if (!client) {
    console.warn("insertMessage skipped — no database client");
    return;
  }

  const { error } = await client.database.from("messages").insert([{
    agent_id: agentId,
    role,
    content,
  }]);

  if (error) {
    console.error("insertMessage failed", error);
  }
}

function newTaskId(): string {
  return `task-${crypto.randomUUID()}`;
}

/** Optimistic agent state transition with optional allowed-from guard (C10/E4). */
export async function updateAgentState(
  agentId: string,
  updates: { state: AgentState; station_id?: string | null },
  allowedFromStates?: AgentState[],
): Promise<boolean> {
  const client = getDbClient();
  if (!client) {
    return updateMockAgent(agentId, updates, allowedFromStates);
  }

  let query = client.database
    .from("agents")
    .update({
      state: updates.state,
      ...(updates.station_id !== undefined
        ? { station_id: updates.station_id }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", agentId);

  if (allowedFromStates?.length) {
    query = query.in("state", allowedFromStates);
  }

  const { data, error } = await query.select("id").maybeSingle();

  if (error) {
    console.error("updateAgentState failed", error);
    return false;
  }

  return data !== null;
}

/** Insert a task row (or mock task) and return the snapshot. */
export async function insertTask(
  agentId: string,
  type: string,
  station: string,
  status: TaskSnapshot["status"] = "active",
): Promise<TaskSnapshot | null> {
  const client = getDbClient();
  const taskId = newTaskId();

  if (!client) {
    return addMockTask(agentId, type, station, status);
  }

  const { data, error } = await client.database
    .from("tasks")
    .insert([{
      id: taskId,
      agent_id: agentId,
      type,
      station,
      status,
    }])
    .select("*")
    .maybeSingle();

  if (error || !data) {
    console.error("insertTask failed", error);
    return null;
  }

  return mapTask(data as TaskRow);
}

/** Assign a task and move the agent toward the target station (E4). */
export async function assignTaskToAgent(
  agentId: string,
  task: TaskAction,
): Promise<{ task: TaskSnapshot; stateUpdated: boolean }> {
  const taskRow = await insertTask(agentId, task.type, task.station, "active");
  if (!taskRow) {
    throw new Error(`Failed to create task for agent ${agentId}`);
  }

  const stateUpdated = await updateAgentState(
    agentId,
    { state: "walking", station_id: task.station },
    ["idle", "working", "talking"],
  );

  if (!stateUpdated) {
    throw new AgentBusyError(agentId);
  }

  return { task: taskRow, stateUpdated };
}

/** Apply structured agent turn — persist optional task + state transitions (E4). */
export async function applyAgentTurn(
  agentId: string,
  turn: AgentTurn,
): Promise<void> {
  if (turn.task) {
    await assignTaskToAgent(agentId, turn.task);
    return;
  }

  // Brief talking state when replying without a movement task.
  await updateAgentState(
    agentId,
    { state: "talking" },
    ["idle", "working"],
  );
}

const VALID_ASSET_KINDS = new Set<AssetKind>(["prop", "clothing", "furniture"]);
const VALID_ASSET_STATUSES = new Set<AssetStatus>([
  "generating",
  "ready",
  "failed",
]);
const VALID_SHAPES = new Set<PrimitiveShape>(["cuboid", "sphere", "capsule"]);

function encodeRenderSpec(render: AssetRenderSpec): string {
  return JSON.stringify(render);
}

function decodeRenderSpec(raw: string | null): AssetRenderSpec | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as AssetRenderSpec;
    if (parsed?.mode === "primitive" || parsed?.mode === "gltf") {
      return parsed;
    }
  } catch {
    // Legacy placeholder paths like primitive:cuboid
    if (raw.startsWith("primitive:")) {
      const shapeRaw = raw.slice("primitive:".length) as PrimitiveShape;
      const shape: PrimitiveShape = VALID_SHAPES.has(shapeRaw)
        ? shapeRaw
        : "cuboid";
      return { mode: "primitive", shape };
    }
  }
  return null;
}

function mapAssetToSpawnEntry(
  row: AssetRow,
  render: AssetRenderSpec,
  position?: { x: number; y: number },
): SpawnQueueEntry {
  return {
    asset_id: row.id,
    kind: row.kind as AssetKind,
    description: row.description,
    status: row.status as AssetStatus,
    requested_by: row.requested_by,
    render,
    x: position?.x ?? 0,
    y: position?.y ?? 0,
  };
}

/** Ready assets awaiting Bevy spawn (Track H foundation). */
export async function fetchSpawnQueue(): Promise<SpawnQueueEntry[]> {
  const client = getDbClient();
  if (!client) {
    return getMockSpawnQueue();
  }

  const { data, error } = await client.database
    .from("assets")
    .select("*")
    .eq("status", "ready")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("fetchSpawnQueue failed", error);
    return [];
  }

  return ((data ?? []) as AssetRow[])
    .map((row) => {
      const render = decodeRenderSpec(row.gltf_path) ??
        ({
          mode: "primitive",
          shape: "cuboid",
          color: "#cccccc",
        } as AssetRenderSpec);
      return mapAssetToSpawnEntry(row, render);
    });
}

export interface InsertAssetInput {
  kind: AssetKind;
  description: string;
  requested_by?: string | null;
  status?: AssetStatus;
  render: AssetRenderSpec;
  storage_url?: string | null;
  x?: number;
  y?: number;
}

/** Persist a generated asset and enqueue it for room-state consumers. */
export async function insertAssetRecord(
  input: InsertAssetInput,
): Promise<SpawnQueueEntry> {
  const assetId = crypto.randomUUID();
  const status = input.status ?? "ready";
  const entry = mapAssetToSpawnEntry(
    {
      id: assetId,
      kind: input.kind,
      description: input.description,
      storage_url: input.storage_url ?? null,
      gltf_path: encodeRenderSpec(input.render),
      requested_by: input.requested_by ?? null,
      status,
    },
    input.render,
    { x: input.x ?? 0, y: input.y ?? 0 },
  );

  const client = getDbClient();
  if (!client) {
    return addMockSpawnEntry(entry);
  }

  if (!VALID_ASSET_KINDS.has(input.kind)) {
    throw new Error(`Invalid asset kind: ${input.kind}`);
  }
  if (!VALID_ASSET_STATUSES.has(status)) {
    throw new Error(`Invalid asset status: ${status}`);
  }

  const { error } = await client.database.from("assets").insert([{
    id: assetId,
    kind: input.kind,
    description: input.description,
    storage_url: input.storage_url ?? null,
    gltf_path: encodeRenderSpec(input.render),
    requested_by: input.requested_by ?? null,
    status,
  }]);

  if (error) {
    console.error("insertAssetRecord failed", error);
    throw new Error("Failed to insert asset record");
  }

  return entry;
}
