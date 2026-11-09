import { timingSafeEqual, randomUUID } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import {
  refreshTravelOrderProvisioning,
  activeProvisioningOrderIds,
} from "@/lib/esim-provisioning-refresh.server";
import { sweepPendingProviderPayments } from "@/lib/mayar-settlement-sweep.server";
import { drainFinanceOutbox } from "@/lib/finance-outbox.server";
import { sweepExpiredOrders } from "@/lib/order-expiry-worker.server";
import { processPreorderQueue, sweepExpiredPreorders } from "@/lib/esim-preorder-queue.server";
import {
  drainTravelEmailOutbox,
  repairPreorderNotifications,
} from "@/lib/preorder-notifications.server";
import { sweepFlightAlerts } from "@/lib/flight-features.server";
import { purgeAssistantHistory } from "@/lib/trip-assistant.server";
import { sweepAssistantReminders } from "@/lib/trip-assistant-reminders.server";
import { sweepShoppingPayments, sweepShopperCatalog } from "@/lib/personal-shopper.server";
import { TRAVEL_TASK_WORKER, recordFailure, recordSuccess } from "@/lib/worker-heartbeat.server";

/**
 * Scheduled travel recovery task.
 *
 * Two jobs run here, in order, because the second depends on the state the first repairs:
 *
 * 1. Settle orders the provider already confirmed but that never settled locally — a customer who
 *    pays inside the provider app and never reopens the order page would otherwise stay unpaid
 *    forever, with no eSIM and no finance posting.
 * 2. Pull provider state for orders that are already provisioning, since eSIM Access only reports
 *    status and data usage through a webhook that is not registered on this deployment.
 *
 * It is called by a timer on the host, never from a browser.
 */

const TASK_SECRET_HEADER = "x-djiwa-task-secret";

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function secretMatches(supplied: string, configured: string) {
  if (!configured) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(configured);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(request: Request) {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (request.headers.get("origin") || request.headers.get("referer"))
    return json({ error: "server_only" }, 403);
  const configured = (process.env["ESIM_SYNC_TASK_SECRET"] ?? "").trim();
  if (!configured) return json({ error: "task_not_configured" }, 503);
  if (!secretMatches((request.headers.get(TASK_SECRET_HEADER) ?? "").trim(), configured))
    return json({ error: "unauthorized" }, 401);

  const settlement = await sweepPendingProviderPayments().catch((error) => {
    console.error("[travel] payment sweep failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { checked: 0, settled: 0, skipped: 0, failed: 0 };
  });

  // Paid preorders past their three-day window require a human decision. They are moved before
  // the automatic purchase sweep so a late top-up never buys an expired order without Admin review.
  const preorderExpiry = await sweepExpiredPreorders().catch((error) => {
    console.error("[travel] preorder expiry sweep failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { movedToReview: 0 };
  });

  const preorders = await processPreorderQueue(10).catch((error) => {
    console.error("[travel] preorder queue failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { checked: 0, started: 0, waitingBalance: 0, busy: false, failed: ["queue"] };
  });

  const orderIds = await activeProvisioningOrderIds(50);
  let ready = 0;
  let pending = 0;
  const failed: string[] = [];
  for (const orderId of orderIds) {
    try {
      const result = await refreshTravelOrderProvisioning(orderId, { force: true });
      if (result.installable) ready += 1;
      else pending += 1;
    } catch (error) {
      failed.push(orderId);
      console.error("[esim] scheduled sync failed", {
        orderId,
        reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      });
    }
  }

  // Drain the finance outbox: a settled order whose ledger entry never posted is retryable work,
  // and this is the only place that repairs it.
  const finance = await drainFinanceOutbox(randomUUID()).catch((error) => {
    console.error("[travel] finance outbox drain failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { posted: 0, failed: 0, deadLetter: 0 };
  });

  // Mark unpaid orders past their window EXPIRED so they stop looking like in-flight payments.
  const expiry = await sweepExpiredOrders().catch((error) => {
    console.error("[travel] expiry sweep failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { scanned: 0, expired: 0, skipped: 0 };
  });

  await repairPreorderNotifications().catch(() => undefined);
  const email = await drainTravelEmailOutbox(20).catch((error) => {
    console.error("[travel] email outbox drain failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { sent: 0, failed: 1, configured: true };
  });

  // Price alerts ride on this timer: each alert is looked at every few hours, not every minute.
  const flightAlerts = await sweepFlightAlerts().catch((error) => {
    console.error("[travel] flight alert sweep failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { checked: 0, notified: 0, closed: 0, failed: 0 };
  });

  // Trip assistant conversations are kept for the Admin retention only (cheap delete by date).
  void purgeAssistantHistory().catch((error) => {
    console.error("[travel] assistant history purge failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
  });

  // Proactive trip reminders (members only, once a day at most, throttled to every half hour).
  void sweepAssistantReminders().catch((error) => {
    console.error("[travel] assistant reminder sweep failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
  });

  // Titip Belanja: settle or expire pending payments, and refresh the store catalog when it is old.
  const shopping = await sweepShoppingPayments().catch((error) => {
    console.error("[travel] shopping payment sweep failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { checked: 0, settled: 0, expired: 0, failed: 1 };
  });
  // Fire and forget (single-flight inside): a slow store never delays the minute task.
  const { purgeDiscoveryPhotos } = await import("@/lib/shopper-discovery.server");
  await purgeDiscoveryPhotos().catch(() => undefined);
  const { sweepChatThreads } = await import("@/lib/shopper-chat.server");
  await sweepChatThreads().catch((error) => {
    console.error("[travel] shopper chat sweep failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
  });
  void sweepShopperCatalog().catch((error) => {
    console.error("[travel] shopping catalog refresh failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
  });

  const workerFailures = failed.length + preorders.failed.length + email.failed + shopping.failed;

  // Liveness last, and only on a clean run: a heartbeat written by a failing worker would claim
  // health it does not have.
  if (workerFailures === 0) await recordSuccess(TRAVEL_TASK_WORKER).catch(() => undefined);
  else
    await recordFailure(TRAVEL_TASK_WORKER, `${workerFailures} task item(s) failed`).catch(
      () => undefined,
    );

  return json({
    ok: true,
    settlement,
    preorderExpiry,
    preorders,
    checked: orderIds.length,
    ready,
    pending,
    failed: failed.length,
    finance,
    expiry,
    email,
    flightAlerts,
  });
}

export const Route = createFileRoute("/api/tasks/esim-sync")({
  server: { handlers: { POST: ({ request }) => run(request) } },
});
