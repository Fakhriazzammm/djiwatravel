import { sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "@/db/client.server";
import { askOpenRouter } from "./openrouter-client";
import { aiConfig } from "./config";
import { liveInsight, parseAIModelContent, previewInsight } from "./live-insight";

const inputSchema = z.object({ page: z.string().trim().min(1).max(80) });
type Aggregate = {
  total_orders: string;
  payment_confirmed: string;
  provisioning: string;
  ready: string;
  failed: string;
};

export const generateAdminAIInsight = createServerFn({ method: "POST" })
  .validator(inputSchema)
  .handler(async ({ data }) => {
    const requestId = crypto.randomUUID();
    if (process.env["ADMIN_AI_LIVE_ENABLED"] !== "true") {
      return previewInsight(
        data.page,
        `Review ${data.page}`,
        "Preview fallback: live AI remains disabled until admin server-side authorization is enabled.",
      );
    }
    let aggregate: Aggregate = {
      total_orders: "0",
      payment_confirmed: "0",
      provisioning: "0",
      ready: "0",
      failed: "0",
    };
    try {
      const result = await db.execute(sql`select
        count(*)::text as total_orders,
        count(*) filter (where status = 'PAYMENT_CONFIRMED')::text as payment_confirmed,
        count(*) filter (where status = 'PROVISIONING')::text as provisioning,
        count(*) filter (where status = 'READY')::text as ready,
        count(*) filter (where status = 'PROVISIONING_FAILED')::text as failed
        from public.customer_orders`);
      aggregate = (result.rows[0] as Aggregate | undefined) ?? aggregate;
    } catch {
      return previewInsight(
        data.page,
        `Review ${data.page}`,
        "Preview fallback: aggregate data is unavailable.",
      );
    }
    if (!aiConfig.enabled || !aiConfig.apiKey || !aiConfig.model) {
      return previewInsight(
        data.page,
        `Review ${data.page}`,
        "Preview fallback: AI provider is not configured.",
      );
    }
    try {
      const response = await askOpenRouter({
        requestId,
        system:
          "You are Djiwa Travel's read-only operations analyst. Return ONLY valid JSON with keys title, summary, severity, recommendation, evidence (array), confidence (0..1). Never invent facts, never expose PII or secrets, and never propose an automatic mutation.",
        question: `Give a concise decision brief for the admin page ${data.page}.`,
        state: { page: data.page, aggregate, mode: "read-only" },
      });
      const envelope = parseAIModelContent(response);
      if (!envelope)
        return previewInsight(
          data.page,
          `Review ${data.page}`,
          "Preview fallback: model response failed validation.",
        );
      return liveInsight(data.page, envelope, response.model ?? aiConfig.model, requestId);
    } catch {
      return previewInsight(
        data.page,
        `Review ${data.page}`,
        "Preview fallback: AI provider is temporarily unavailable.",
      );
    }
  });
