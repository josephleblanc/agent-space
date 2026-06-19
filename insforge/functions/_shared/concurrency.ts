/**
 * Per-agent concurrency guard (Track C10).
 *
 * Problem: two simultaneous voice commands ("Researcher, go code" + "Researcher,
 * check the bench") can race in agent-chat / vapi-webhook and corrupt agent state
 * or double-assign tasks.
 *
 * Strategy (layered):
 *
 * 1. In-process lock (this module) — cheap mutex for a warm Deno isolate handling
 *    back-to-back requests on the same instance. NOT sufficient alone across cold
 *    starts or horizontal scale-out.
 *
 * 2. DB optimistic guard (Track E) — when mutating agents/tasks, use:
 *      UPDATE agents SET state = $next, updated_at = now()
 *      WHERE id = $id AND state IN ($allowed_from_states)
 *    and treat zero rows updated as "agent busy, reject or queue".
 *
 * 3. Task queue (stretch) — INSERT tasks with status='pending' and a worker that
 *    promotes one active task per agent_id at a time.
 *
 * Usage: wrap agent mutations with withAgentLock(agentId, async () => { ... }).
 */

const locks = new Map<string, Promise<void>>();

export class AgentBusyError extends Error {
  constructor(agentId: string) {
    super(`Agent ${agentId} is busy processing another request`);
    this.name = "AgentBusyError";
  }
}

/** Returns true if this isolate currently holds an in-flight lock for the agent. */
export function isAgentLocked(agentId: string): boolean {
  return locks.has(agentId);
}

/**
 * Serialize work for one agent within this edge-function instance.
 * Concurrent callers await the prior lock; failures still release the lock.
 */
export async function withAgentLock<T>(
  agentId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prior = locks.get(agentId) ?? Promise.resolve();

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const chain = prior.then(() => gate);
  locks.set(agentId, chain);

  await prior;

  try {
    return await fn();
  } finally {
    release();
    if (locks.get(agentId) === chain) {
      locks.delete(agentId);
    }
  }
}

/**
 * DB-level guard sketch for Track E — call before state transitions:
 *
 *   const { data, error } = await client.database
 *     .from('agents')
 *     .update({ state: 'walking', station_id: station, updated_at: new Date().toISOString() })
 *     .eq('id', agentId)
 *     .in('state', ['idle', 'working'])
 *     .select()
 *     .maybeSingle();
 *
 *   if (!data) throw new AgentBusyError(agentId);
 */
