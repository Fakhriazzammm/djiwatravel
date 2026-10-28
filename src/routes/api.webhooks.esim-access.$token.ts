import { createHash } from "node:crypto";
import { appendFile, chmod, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createFileRoute } from "@tanstack/react-router";
import {
  InMemoryWebhookDedupe,
  mapProviderStatus,
  normalizeProviderWebhook,
  normalizeUsagePayload,
  shouldApplyProfileStatus,
  type ProviderWebhook,
} from "@/lib/esim-access-webhooks";
import { isValidWebhookToken, resolveWebhookToken } from "@/lib/esim-access-webhook-auth";
import { sql } from "drizzle-orm";
import { db } from "@/db/client.server";
import { protectProviderProfile } from "@/lib/esim-profile-protection";
import { refreshTravelOrderProvisioning } from "@/lib/esim-provisioning-refresh.server";
const dedupe = new InMemoryWebhookDedupe();
const persistedFingerprints = new Set<string>();
let persistedLoad: Promise<void> | undefined;

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function fromQuery(url: URL) {
  const content: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams.entries()) {
    const match = /^content\[([A-Za-z0-9_]+)\]$/.exec(key);
    if (match?.[1]) content[match[1]] = value;
  }
  return {
    notifyId: url.searchParams.get("notifyId") ?? undefined,
    notifyType: url.searchParams.get("notifyType") ?? "",
    eventGenerateTime: url.searchParams.get("eventGenerateTime") ?? undefined,
    content,
  };
}

async function parseRequest(
  request: Request,
): Promise<unknown | "probe" | "too-large" | "invalid"> {
  if (request.method === "GET") {
    const url = new URL(request.url);
    return url.searchParams.has("notifyType") ? fromQuery(url) : "probe";
  }
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 32_768) return "too-large";
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 32_768) return "too-large";
  if (!text.trim()) return "invalid";
  if (request.headers.get("content-type")?.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch {
      return "invalid";
    }
  }
  const params = new URLSearchParams(text);
  if (params.has("notifyType")) {
    const url = new URL("https://local.invalid/");
    url.search = params.toString();
    return fromQuery(url);
  }
  return "invalid";
}

async function loadPersistedReceipts(file: string) {
  persistedLoad ??= (async () => {
    try {
      const text = await readFile(file, "utf8");
      for (const line of text.split("\n")) {
        try {
          const stored = JSON.parse(line) as { fingerprint?: string; event?: ProviderWebhook };
          if (stored.fingerprint) persistedFingerprints.add(stored.fingerprint);
          if (stored.event) dedupe.remember(stored.event);
        } catch {
          /* Ignore a partial/corrupt trailing receipt; future receipts remain processable. */
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  })();
  await persistedLoad;
}

function eventTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const number = Number(value);
  const date = Number.isFinite(number)
    ? new Date(number < 10_000_000_000 ? number * 1000 : number)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function receive(request: Request, token: string) {
  const secret = process.env["ESIM_ACCESS_SECRET_KEY"];
  const webhookToken = resolveWebhookToken();
  if (!secret || !webhookToken) return json({ error: "webhook_unconfigured" }, 503);
  if (!isValidWebhookToken(token, webhookToken)) return json({ error: "not_found" }, 404);
  if (request.method === "HEAD")
    return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });

  const parsed = await parseRequest(request);
  if (parsed === "probe") return json({ ok: true, endpoint: "esim-access-webhook" });
  if (parsed === "too-large") return json({ error: "payload_too_large" }, 413);
  if (parsed === "invalid") return json({ error: "invalid_payload" }, 400);
  const event = normalizeProviderWebhook(parsed, secret);
  if (!event) return json({ error: "unsupported_or_invalid_event" }, 400);
  if (event.notifyType === "CHECK_HEALTH") return json({ ok: true, healthCheck: true });

  const file =
    process.env["ESIM_ACCESS_WEBHOOK_LOG_PATH"] ||
    "/var/lib/djiwatravel/esim-access-webhooks.jsonl";
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await loadPersistedReceipts(file);
  if (dedupe.has(event)) return json({ ok: true, duplicate: true });

  const fingerprint = createHash("sha256").update(JSON.stringify(event)).digest("hex");
  if (persistedFingerprints.has(fingerprint)) {
    dedupe.remember(event);
    return json({ ok: true, duplicate: true });
  }

  try {
    const content = event.content ?? {};
    const usage = normalizeUsagePayload(event.notifyType, content);
    const providerEventAt = eventTimestamp(event.eventGenerateTime);
    const providerOrderNo = typeof content["orderNo"] === "string" ? content["orderNo"] : null;
    const providerTransactionId =
      typeof content["transactionId"] === "string" ? content["transactionId"] : null;
    const rawStatus = content["esimStatus"] ?? content["smdpStatus"] ?? content["orderStatus"];
    const normalizedRawStatus = rawStatus == null ? null : String(rawStatus).toUpperCase();
    const profileStatus = mapProviderStatus(normalizedRawStatus);
    const providerStatus = normalizedRawStatus?.slice(0, 80) ?? null;
    const result = await db.execute(sql`update public.esim_provisioning_orders
      set provider_status = coalesce(${providerStatus}, provider_status),
          status = case when ${profileStatus} in ('REVOKED','CANCELLED') then 'FAILED' else status end,
          last_provider_response = jsonb_build_object('notifyId', ${event.notifyId}, 'notifyType', ${event.notifyType}, 'content', ${JSON.stringify(content)}::jsonb),
          updated_at = now()
      where (${providerOrderNo} is not null and provider_order_no = ${providerOrderNo})
         or (${providerTransactionId} is not null and provider_transaction_id = ${providerTransactionId})
      returning order_id, status`);
    for (const row of result.rows as Array<{ order_id?: string; status?: string }>) {
      if (row.order_id && row.status === "FAILED") {
        await db.execute(
          sql`update public.customer_orders set status = 'PROVISIONING_FAILED', updated_at = now() where id = ${row.order_id}::uuid and status = 'PROVISIONING'`,
        );
      }
      if (
        row.order_id &&
        event.notifyType === "ORDER_STATUS" &&
        normalizedRawStatus === "GOT_RESOURCE"
      ) {
        await refreshTravelOrderProvisioning(row.order_id, { force: true });
      }
    }
    const rawInput = recordOf(parsed);
    const rawContent = recordOf(rawInput?.["content"]);
    const rawIccid = typeof rawContent?.["iccid"] === "string" ? rawContent.iccid : null;
    if (rawIccid && profileStatus !== "UNKNOWN") {
      const existingProfiles = await db.execute(
        sql`select id, profile_status from public.esim_profiles where iccid = ${rawIccid} limit 1`,
      );
      for (const row of existingProfiles.rows as Array<{ id?: string; profile_status?: string }>) {
        if (
          row.id &&
          shouldApplyProfileStatus(mapProviderStatus(row.profile_status), profileStatus)
        ) {
          await db.execute(
            sql`update public.esim_profiles set profile_status = ${profileStatus}, activated_at = case when ${profileStatus} in ('ENABLED','IN_USE') then coalesce(activated_at, now()) else activated_at end, updated_at = now() where id = ${row.id}::uuid`,
          );
        }
      }
    }
    if (rawIccid) {
      const profileLookup = await db.execute(
        sql`select id from public.esim_provisioning_orders where (${providerOrderNo} is not null and provider_order_no = ${providerOrderNo}) or (${providerTransactionId} is not null and provider_transaction_id = ${providerTransactionId}) limit 1`,
      );
      const provisioningOrderId = (profileLookup.rows[0] as { id?: string } | undefined)?.id;
      if (provisioningOrderId) {
        try {
          const protectedProfile = protectProviderProfile(provisioningOrderId, rawContent);
          await db.execute(sql`insert into public.esim_profiles(provisioning_order_id, iccid, esim_tran_no, smdp_address, activation_code_encrypted, qr_payload_encrypted, profile_status, installable, activated_at, expires_at, provider_payload, updated_at)
            values (${provisioningOrderId}::uuid, ${protectedProfile.iccid}, ${protectedProfile.esimTranNo ?? null}, ${protectedProfile.smdpAddress ?? null}, ${protectedProfile.activationCodeEncrypted ?? null}, ${protectedProfile.qrPayloadEncrypted ?? null}, ${mapProviderStatus(protectedProfile.status)}, ${Boolean(protectedProfile.qrPayloadEncrypted)}, ${protectedProfile.activatedAt ?? null}::timestamptz, ${protectedProfile.expiresAt ?? null}::timestamptz, ${JSON.stringify({ notifyId: event.notifyId })}::jsonb, now())
            on conflict (iccid) do update set esim_tran_no = coalesce(excluded.esim_tran_no, public.esim_profiles.esim_tran_no), smdp_address = coalesce(excluded.smdp_address, public.esim_profiles.smdp_address), activation_code_encrypted = excluded.activation_code_encrypted, qr_payload_encrypted = excluded.qr_payload_encrypted, installable = excluded.installable, profile_status = excluded.profile_status, activated_at = coalesce(excluded.activated_at, public.esim_profiles.activated_at), expires_at = coalesce(excluded.expires_at, public.esim_profiles.expires_at), updated_at = now()`);
          if (protectedProfile.qrPayloadEncrypted) {
            await db.execute(
              sql`update public.esim_provisioning_orders set status = 'READY', updated_at = now() where id = ${provisioningOrderId}::uuid and status in ('PROVISIONING','PENDING')`,
            );
            await db.execute(
              sql`update public.customer_orders set status = 'READY', esim_activation_expires_at = coalesce(esim_activation_expires_at, (select expires_at from public.esim_profiles where provisioning_order_id = ${provisioningOrderId}::uuid and installable = true order by created_at desc limit 1)), updated_at = now() where id = (select order_id from public.esim_provisioning_orders where id = ${provisioningOrderId}::uuid) and status in ('PROVISIONING','PAYMENT_CONFIRMED')`,
            );
          }
        } catch {
          // Status reconciliation remains valid even when a provider payload has no installable profile.
        }
      }
    }
    await db.execute(sql`insert into public.provider_webhook_events(
        provider, notify_id, notify_type, event_fingerprint, payload, processed_at,
        provider_event_at, synced_at, data_usage_total_volume, data_usage_order_usage,
        data_usage_remain, validity_usage_total_duration, validity_usage_expired_time, validity_usage_remain
      ) values (
        'esimaccess', ${event.notifyId}, ${event.notifyType}, ${fingerprint}, ${JSON.stringify(event)}::jsonb, now(),
        ${providerEventAt}::timestamptz, now(),
        ${usage.dataUsage?.totalVolume ?? null}, ${usage.dataUsage?.orderUsage ?? null}, ${usage.dataUsage?.remain ?? null},
        ${usage.validityUsage?.totalDuration ?? null}, ${usage.validityUsage?.expiredTime ?? null}::timestamptz, ${usage.validityUsage?.remain ?? null}
      ) on conflict do nothing`);
  } catch (error) {
    return json({ error: "webhook_processing_failed" }, 503);
  }
  try {
    const receipt = {
      receivedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      fingerprint,
      event,
    };
    await appendFile(file, `${JSON.stringify(receipt)}\n`, { encoding: "utf8", mode: 0o600 });
    await chmod(file, 0o600);
  } catch {
    return json({ error: "webhook_receipt_failed" }, 503);
  }
  persistedFingerprints.add(fingerprint);
  dedupe.remember(event);
  return json({ ok: true, accepted: true }, 200);
}

export const Route = createFileRoute("/api/webhooks/esim-access/$token")({
  server: {
    handlers: {
      HEAD: ({ request, params }) => receive(request, params.token),
      GET: ({ request, params }) => receive(request, params.token),
      POST: ({ request, params }) => receive(request, params.token),
    },
  },
});
