/**
 * Local edge-function dev server (Track C9).
 *
 * Mimics InsForge function URLs so Trunk can proxy /functions/* here during development.
 *
 *   cd insforge && deno task dev
 *
 * Endpoints:
 *   GET  http://127.0.0.1:8787/functions/room-state
 *   POST http://127.0.0.1:8787/functions/agent-chat
 *   POST http://127.0.0.1:8787/functions/vapi-webhook
 *   POST http://127.0.0.1:8787/functions/generate-asset
 */

import roomState from "./functions/room-state/index.ts";
import agentChat from "./functions/agent-chat/index.ts";
import vapiWebhook from "./functions/vapi-webhook/index.ts";
import generateAsset from "./functions/generate-asset/index.ts";

const PORT = Number(Deno.env.get("INSFORGE_DEV_PORT") ?? "8787");

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "/functions/room-state": roomState,
  "/functions/agent-chat": agentChat,
  "/functions/vapi-webhook": vapiWebhook,
  "/functions/generate-asset": generateAsset,
};

function notFound(pathname: string): Response {
  return new Response(JSON.stringify({ error: `No function for ${pathname}` }), {
    status: 404,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve({ port: PORT, hostname: "127.0.0.1" }, async (req) => {
  const url = new URL(req.url);
  const handler = routes[url.pathname];
  if (!handler) {
    return notFound(url.pathname);
  }
  return handler(req);
});

console.log(`InsForge local dev server on http://127.0.0.1:${PORT}`);
console.log("  GET  /functions/room-state");
console.log("  POST /functions/agent-chat");
console.log("  POST /functions/vapi-webhook");
console.log("  POST /functions/generate-asset");
