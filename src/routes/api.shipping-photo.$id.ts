import { createFileRoute } from "@tanstack/react-router";

/** A weigh-in photo: the customer who owns the shipment, or the team with ?admin=1. Never cached. */
export const Route = createFileRoute("/api/shipping-photo/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          if (!/^[0-9a-f-]{36}$/i.test(params.id))
            return new Response("Not found", { status: 404 });
          const { shippingPhoto } = await import("@/lib/shipping.server");
          let admin = false;
          let viewerId: string | null = null;
          if (new URL(request.url).searchParams.get("admin") === "1") {
            const { requireOps } = await import("@/lib/shipping-access.server");
            await requireOps();
            admin = true;
          } else {
            try {
              const { getAuthenticatedUser } = await import("@/lib/customer-session.fn");
              viewerId = (await getAuthenticatedUser())?.id ?? null;
            } catch {
              viewerId = null;
            }
          }
          const row = await shippingPhoto(params.id, admin, viewerId);
          if (!row) return new Response("Not found", { status: 404 });
          return new Response(new Uint8Array(row.bytes), {
            headers: {
              "Content-Type": row.mime,
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
              "Content-Security-Policy": "default-src 'none'",
            },
          });
        } catch {
          return new Response("Not found", { status: 404 });
        }
      },
    },
  },
});
