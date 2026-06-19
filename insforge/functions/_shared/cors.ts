/** CORS helpers for browser clients polling from a different origin than edge functions. */

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Vapi-Secret",
  "Access-Control-Max-Age": "86400",
};

export function jsonHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    ...CORS_HEADERS,
    "Content-Type": "application/json",
    ...extra,
  };
}

export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return null;
}

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders(extraHeaders),
  });
}

export function errorResponse(
  message: string,
  status = 400,
): Response {
  return jsonResponse({ error: message }, status);
}
