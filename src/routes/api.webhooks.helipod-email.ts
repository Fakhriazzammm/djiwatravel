import { createFileRoute } from "@tanstack/react-router";

/**
 * Helipod Email delivery events (delivered, bounced, complained, ...). Signed with the webhook
 * secret `HELIPOD_EMAIL_WEBHOOK_SECRET`; see src/lib/helipod-email-webhook.server.ts.
 */
export const Route = createFileRoute("/api/webhooks/helipod-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleHelipodEmailWebhook } = await import("@/lib/helipod-email-webhook.server");
        return handleHelipodEmailWebhook(request);
      },
    },
  },
});
