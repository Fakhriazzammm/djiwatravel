import { createFileRoute } from "@tanstack/react-router";

/** A chat photo: the customer who owns the thread, or the team with ?admin=1. */
export const Route = createFileRoute("/api/shopper-chat-photo/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          if (!/^[0-9a-f-]{36}$/i.test(params.id))
            return new Response("Not found", { status: 404 });
          const { chatAttachment } = await import("@/lib/shopper-chat.server");
          let viewer: { subject: string } | "admin";
          if (new URL(request.url).searchParams.get("admin") === "1") {
            const { requireAdmin } = await import("@/lib/admin-guard");
            await requireAdmin();
            viewer = "admin";
          } else {
            const { authenticateCustomerRequest } = await import("@/lib/customer-session.server");
            viewer = { subject: (await authenticateCustomerRequest(request)).id };
          }
          const row = await chatAttachment(params.id, viewer);
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
          return new Response("Unauthorized", { status: 401 });
        }
      },
    },
  },
});
