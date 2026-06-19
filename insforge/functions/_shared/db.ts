/**
 * InsForge database client and room-state query helpers.
 *
 * Deployed edge functions receive INSFORGE_BASE_URL and ANON_KEY automatically.
 * For privileged writes (tasks, agent state), prefer SERVICE_ROLE_KEY when set.
 */

import { createClient, type InsForgeClient } from "npm:@insforge/sdk@latest";
import type { AgentSnapshot, RoomSnapshot, TaskSnapshot } from "./protocol.ts";
import { MOCK_ROOM_SNAPSHOT } from "./mock.ts";

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
  };
}

/** DB when configured, otherwise the canned seed snapshot for local/offline dev. */
export async function getRoomSnapshot(): Promise<RoomSnapshot> {
  const fromDb = await fetchRoomSnapshot();
  return fromDb ?? MOCK_ROOM_SNAPSHOT;
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

  const { error } = await client.database.from("messages").insert({
    agent_id: agentId,
    role,
    content,
  });

  if (error) {
    console.error("insertMessage failed", error);
  }
}
