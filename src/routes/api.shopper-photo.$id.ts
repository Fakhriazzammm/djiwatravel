import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/shopper-photo/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const { authenticateCustomerRequest } = await import("@/lib/customer-session.server");
          const user = await authenticateCustomerRequest(request);
          const { pool } = await import("@/db/client.server");
          let admin = false;
          if (new URL(request.url).searchParams.get("admin") === "1") {
            const { requireAdmin } = await import("@/lib/admin-guard");
            await requireAdmin();
            admin = true;
          }
          if (!/^[0-9a-f-]{36}$/i.test(params.id))
            return new Response("Not found", { status: 404 });
          const result = await pool.query(
            `select photo_mime,photo_bytes from shopping_discovery_requests where id=$1 and photo_expires_at>now() and photo_bytes is not null ${admin ? "" : "and customer_auth_subject=$2"}`,
            admin ? [params.id] : [params.id, user.id],
          );
          const row = result.rows[0] as { photo_mime: string; photo_bytes: Buffer } | undefined;
          if (!row) return new Response("Not found", { status: 404 });
          return new Response(new Uint8Array(row.photo_bytes), {
            headers: {
              "Content-Type": row.photo_mime,
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
              "Content-Security-Policy": "default-src 'none'",
            },
          });
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }
      },
    },
  },
});
