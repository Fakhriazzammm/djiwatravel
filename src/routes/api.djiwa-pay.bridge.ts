import { createFileRoute } from "@tanstack/react-router";
import { createDjiwaPayBridgeUrl, DjiwaPayBridgeError } from "@/lib/djiwa-pay-bridge.server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function receive(request: Request) {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  try {
    return json({ url: await createDjiwaPayBridgeUrl(request) });
  } catch (error) {
    if (error instanceof DjiwaPayBridgeError) return json({ error: error.message }, error.status);
    return json({ error: "SSO Djiwa Pay gagal dimulai" }, 502);
  }
}

export const Route = createFileRoute("/api/djiwa-pay/bridge")({
  server: { handlers: { GET: ({ request }) => receive(request) } },
});
