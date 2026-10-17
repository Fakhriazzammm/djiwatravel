import { createFileRoute } from "@tanstack/react-router";
import { getCustomerRefund, requestCustomerRefund } from "@/lib/customer-refund.server";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function receive(request: Request) {
  try {
    const input =
      request.method === "GET"
        ? { order: new URL(request.url).searchParams.get("order") ?? "" }
        : await request.json();
    return json(
      request.method === "GET"
        ? await getCustomerRefund(input)
        : await requestCustomerRefund(input),
    );
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Refund request failed" },
      (e as { status?: number }).status ?? 400,
    );
  }
}
export const Route = createFileRoute("/api/customer-refund")({
  server: {
    handlers: { GET: ({ request }) => receive(request), POST: ({ request }) => receive(request) },
  },
});
