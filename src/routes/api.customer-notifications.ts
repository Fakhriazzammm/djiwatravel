import { createFileRoute } from "@tanstack/react-router";
import {
  listCustomerNotifications,
  markCustomerNotificationRead,
  mutateCustomerPush,
} from "@/lib/customer-notifications.server";
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function receive(request: Request) {
  try {
    if (request.method === "GET")
      return json(
        await listCustomerNotifications(Object.fromEntries(new URL(request.url).searchParams)),
      );
    const body = (await request.json()) as { action?: string; notification_id?: string };
    if (body.action === "read")
      return json(await markCustomerNotificationRead(body.notification_id ?? ""));
    return json(await mutateCustomerPush(body));
  } catch (e) {
    return json(
      { error: e instanceof Error ? e.message : "Request failed" },
      (e as { status?: number }).status ?? 400,
    );
  }
}
export const Route = createFileRoute("/api/customer-notifications")({
  server: {
    handlers: {
      GET: ({ request }) => receive(request),
      POST: ({ request }) => receive(request),
      PATCH: ({ request }) => receive(request),
    },
  },
});
