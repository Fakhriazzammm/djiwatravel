import { createFileRoute } from "@tanstack/react-router";
import {
  CanonicalIdentityConfigurationError,
  createDjiwaPayTopupForRequest,
} from "@/lib/djiwa-pay-topup.server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function receive(request: Request) {
  try {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    return json(await createDjiwaPayTopupForRequest(request));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Top up gagal. Coba lagi.";
    const status = message === "Autentikasi diperlukan"
      ? 401
      : error instanceof CanonicalIdentityConfigurationError
        ? 503
        : 400;
    return json({ error: message }, status);
  }
}

export const Route = createFileRoute("/api/djiwa-pay/topup")({ server: { handlers: { POST: ({ request }) => receive(request) } } });
