import { createFileRoute } from "@tanstack/react-router";
import { recoverGuestOrder } from "@/lib/customer-order-recovery.server";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export const Route = createFileRoute("/api/order-recovery")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          return json(await recoverGuestOrder(await request.json()));
        } catch (error) {
          const status = (error as { status?: number }).status ?? 400;
          return json(
            { error: error instanceof Error ? error.message : "Permintaan pemulihan gagal" },
            status,
          );
        }
      },
    },
  },
});
