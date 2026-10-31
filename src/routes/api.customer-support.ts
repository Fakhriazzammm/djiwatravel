import { createFileRoute } from "@tanstack/react-router";
import { listCustomerCases, mutateCustomerSupport } from "@/lib/customer-support.server";
function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
async function receive(request: Request) {
  try {
    if (request.method === "GET") return json(await listCustomerCases());
    return json(await mutateCustomerSupport(await request.json()));
  } catch (error) {
    const status = (error as { status?: number }).status ?? 400;
    return json(
      { error: error instanceof Error ? error.message : "Permintaan support gagal" },
      status,
    );
  }
}
export const Route = createFileRoute("/api/customer-support")({
  server: {
    handlers: { GET: ({ request }) => receive(request), POST: ({ request }) => receive(request) },
  },
});
