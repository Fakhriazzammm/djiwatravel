import { createFileRoute } from "@tanstack/react-router";

/** A Feeds photo: anyone for a published post, its owner while pending, the team with ?admin=1. */
export const Route = createFileRoute("/api/feed-photo/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          if (!/^[0-9a-f-]{36}$/i.test(params.id))
            return new Response("Not found", { status: 404 });
          const { feedPhoto } = await import("@/lib/feeds.server");
          let admin = false;
          let viewerId: string | null = null;
          if (new URL(request.url).searchParams.get("admin") === "1") {
            const { requireAdmin } = await import("@/lib/admin-guard");
            await requireAdmin();
            admin = true;
          } else {
            try {
              const { getAuthenticatedUser } = await import("@/lib/customer-session.fn");
              viewerId = (await getAuthenticatedUser())?.id ?? null;
            } catch {
              viewerId = null;
            }
          }
          const row = await feedPhoto(params.id, admin, viewerId);
          if (!row) return new Response("Not found", { status: 404 });
          return new Response(new Uint8Array(row.bytes), {
            headers: {
              "Content-Type": row.mime,
              "Cache-Control": row.cacheable ? "public, max-age=300" : "private, no-store",
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
