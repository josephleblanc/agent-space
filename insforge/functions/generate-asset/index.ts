/**
 * POST /functions/generate-asset
 * Stretch Track H foundation — Nebius text spec + placeholder asset record.
 *
 * Accepts a natural-language description, asks Nebius for structured primitive
 * metadata (no image/mesh generation yet), persists an `assets` row, and returns
 * a spawn-queue entry for room-state consumers.
 */

import type { AssetKind, AssetRenderSpec, PrimitiveShape } from "../_shared/protocol.ts";
import { handlePreflight, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { getAgentById, insertAssetRecord } from "../_shared/db.ts";
import {
  getNebiusApiKey,
  nebiusChatCompletion,
} from "../_shared/nebius.ts";

export interface GenerateAssetRequest {
  description: string;
  kind?: AssetKind;
  requested_by?: string;
  x?: number;
  y?: number;
}

interface AssetSpecResponse {
  label?: string;
  kind?: string;
  shape?: string;
  color?: string;
  width?: number;
  height?: number;
  depth?: number;
  speech?: string;
}

const ASSET_SPEC_INSTRUCTION = `
You design simple 3D game props for a virtual office hangout.
Respond with a single JSON object only — no markdown fences.
Schema:
{
  "label": "short item name",
  "kind": "prop|clothing|furniture",
  "shape": "cuboid|sphere|capsule",
  "color": "#rrggbb hex or plain color name",
  "width": number,
  "height": number,
  "depth": number,
  "speech": "one sentence confirming what was created"
}
Pick reasonable dimensions in meters (typical props: 0.3–2.0).
`.trim();

const VALID_KINDS = new Set<AssetKind>(["prop", "clothing", "furniture"]);
const VALID_SHAPES = new Set<PrimitiveShape>(["cuboid", "sphere", "capsule"]);

function parseBody(body: unknown): GenerateAssetRequest | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.description !== "string" || !record.description.trim()) {
    return null;
  }

  const kind = typeof record.kind === "string"
    ? record.kind as AssetKind
    : undefined;

  return {
    description: record.description.trim(),
    kind: kind && VALID_KINDS.has(kind) ? kind : undefined,
    requested_by: typeof record.requested_by === "string"
      ? record.requested_by
      : undefined,
    x: typeof record.x === "number" ? record.x : undefined,
    y: typeof record.y === "number" ? record.y : undefined,
  };
}

function parseAssetSpec(raw: string, fallbackDescription: string): AssetSpecResponse {
  try {
    return JSON.parse(raw) as AssetSpecResponse;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as AssetSpecResponse;
      } catch {
        // fall through
      }
    }
  }

  return {
    label: fallbackDescription.slice(0, 48),
    kind: "prop",
    shape: "cuboid",
    color: "#cccccc",
    width: 1,
    height: 1,
    depth: 1,
    speech: `Created a placeholder for "${fallbackDescription}".`,
  };
}

function normalizeKind(value: string | undefined, fallback: AssetKind): AssetKind {
  const kind = (value ?? fallback).toLowerCase() as AssetKind;
  return VALID_KINDS.has(kind) ? kind : fallback;
}

function normalizeShape(value: string | undefined): PrimitiveShape {
  const shape = (value ?? "cuboid").toLowerCase() as PrimitiveShape;
  return VALID_SHAPES.has(shape) ? shape : "cuboid";
}

function buildRenderSpec(spec: AssetSpecResponse): AssetRenderSpec {
  return {
    mode: "primitive",
    shape: normalizeShape(spec.shape),
    texture_url: null,
    color: spec.color ?? "#cccccc",
    width: spec.width ?? 1,
    height: spec.height ?? 1,
    depth: spec.depth ?? 1,
  };
}

async function generateAssetSpec(
  description: string,
  kind: AssetKind,
): Promise<AssetSpecResponse> {
  if (!getNebiusApiKey()) {
    return {
      label: description.slice(0, 48),
      kind,
      shape: "cuboid",
      color: "#aabbcc",
      width: 1,
      height: 0.8,
      depth: 0.5,
      speech:
        `[offline] Queued a textured ${kind} placeholder for "${description}".`,
    };
  }

  const content = await nebiusChatCompletion([
    { role: "system", content: ASSET_SPEC_INSTRUCTION },
    {
      role: "user",
      content: `Create a ${kind} for the office: ${description}`,
    },
  ]);

  return parseAssetSpec(content, description);
}

export default async function handler(req: Request): Promise<Response> {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  let payload: GenerateAssetRequest | null;
  try {
    payload = parseBody(await req.json());
  } catch {
    return errorResponse("Invalid JSON body");
  }

  if (!payload) {
    return errorResponse("description is required");
  }

  if (payload.requested_by) {
    const agent = await getAgentById(payload.requested_by);
    if (!agent) {
      return errorResponse(`Unknown agent: ${payload.requested_by}`, 404);
    }
  }

  const kind = payload.kind ?? "prop";

  try {
    const spec = await generateAssetSpec(payload.description, kind);
    const render = buildRenderSpec(spec);
    const entry = await insertAssetRecord({
      kind: normalizeKind(spec.kind, kind),
      description: spec.label?.trim() || payload.description,
      requested_by: payload.requested_by ?? null,
      status: "ready",
      render,
      storage_url: null,
      x: payload.x ?? 0,
      y: payload.y ?? 0,
    });

    const speech = spec.speech?.trim() ||
      `Created ${entry.description} — it will appear in the room shortly.`;

    return jsonResponse({
      ok: true,
      asset_id: entry.asset_id,
      spawn: entry,
      speech,
    });
  } catch (err) {
    console.error("generate-asset failed", err);
    const message = err instanceof Error ? err.message : "Asset generation failed";
    return errorResponse(message, 500);
  }
}
