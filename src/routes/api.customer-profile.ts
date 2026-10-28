import { createFileRoute } from "@tanstack/react-router";
import {
  readCustomerProfile,
  writeCustomerProfile,
} from "@/lib/customer-profile.server";
import { authenticateCustomerRequest } from "@/lib/customer-session.server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function receive(request: Request) {
  try {
    const user = await authenticateCustomerRequest(request);
    if (request.method === "GET") return json(await readCustomerProfile(user));
    const body = await request.json();
    return json(await writeCustomerProfile(user, body));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Permintaan profil gagal" }, 401);
  }
}

export const Route = createFileRoute("/api/customer-profile")({
  server: {
    handlers: { GET: ({ request }) => receive(request), POST: ({ request }) => receive(request) },
  },
});
