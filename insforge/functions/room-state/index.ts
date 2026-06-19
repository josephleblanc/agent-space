/**
 * GET /functions/room-state
 * Returns the current RoomSnapshot for Bevy + api-client polling.
 */

import { handlePreflight, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getRoomSnapshot, isDbConfigured } from "../_shared/db.ts";

export default async function handler(req: Request): Promise<Response> {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  const snapshot = await getRoomSnapshot();

  return jsonResponse(snapshot, 200, {
    "X-Room-Source": isDbConfigured() ? "database" : "mock-seed",
  });
}
