import { createFileRoute } from "@tanstack/react-router";

/** Streams the receipt photo attached to an expense, only to the trip's owner. */
export const Route = createFileRoute("/api/receipt-photo/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { authenticateCustomerRequest } = await import("@/lib/customer-session.server");
          const { readReceiptPhoto } = await import("@/lib/receipt-scan.server");
          const user = await authenticateCustomerRequest(request);
          const photo = await readReceiptPhoto(user.id, params.id);
          if (!photo) return new Response("Not found", { status: 404 });
          return new Response(new Uint8Array(photo.bytes), {
            headers: {
              "Content-Type": photo.mime,
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
            },
          });
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }
      },
    },
  },
});
