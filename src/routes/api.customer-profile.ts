import { createFileRoute } from "@tanstack/react-router";
import { getCustomerProfile, upsertCustomerProfile } from "@/lib/customer-profile.server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function receive(request: Request) {
  try {
    if (request.method === "GET") return json(await getCustomerProfile({ data: undefined }));
    const body = await request.json();
    return json(await upsertCustomerProfile({ data: body }));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Permintaan profil gagal" }, 401);
  }
}

export const Route = createFileRoute("/api/customer-profile")({
  server: {
    handlers: { GET: ({ request }) => receive(request), POST: ({ request }) => receive(request) },
  },
});
