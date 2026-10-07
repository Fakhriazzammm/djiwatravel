import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { appendFile, chmod, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createFileRoute } from "@tanstack/react-router";
import { InMemoryWebhookDedupe, mapProviderStatus, type ProviderWebhook } from "@/lib/esim-access-webhooks";
import { sql } from "drizzle-orm";
import { db } from "@/db/client.server";
import { protectProviderProfile } from "@/lib/esim-profile-protection";

const allowedTypes = new Set(["ORDER_STATUS", "ESIM_STATUS", "DATA_USAGE", "VALIDITY_USAGE", "SMDP_EVENT"]);
const allowedContentKeys = [
  "orderNo", "transactionId", "orderStatus", "esimStatus", "smdpStatus",
  "totalVolume", "orderUsage", "remain", "durationUnit", "totalDuration",
  "expiredTime", "packageCode",
] as const;
const dedupe = new InMemoryWebhookDedupe();
const persistedFingerprints = new Set<string>();
let persistedLoad: Promise<void> | undefined;

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function expectedToken(secret: string) {
  return createHmac("sha256", secret).update("djiwatravel:esimaccess-webhook:v1").digest("hex");
}

function isValidToken(provided: string, secret: string) {
  const expected = Buffer.from(expectedToken(secret));
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function scalar(value: unknown): string | number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 160);
  return undefined;
}

function normalizeEvent(raw: unknown, secret: string): ProviderWebhook | null {
  const input = recordOf(raw);
  if (!input) return null;
  const notifyType = String(input["notifyType"] ?? "").trim().toUpperCase();
  if (!allowedTypes.has(notifyType)) return null;
  const sourceContent = recordOf(input["content"]) ?? {};
  const content: Record<string, unknown> = {};
  for (const key of allowedContentKeys) {
    const value = scalar(sourceContent[key]);
    if (value !== undefined) content[key] = value;
  }
  const iccid = scalar(sourceContent["iccid"]);
  if (iccid !== undefined) {
    content["iccidHash"] = createHmac("sha256", secret).update(String(iccid)).digest("hex");
  }
  const eventGenerateTime = scalar(input["eventGenerateTime"]);
  const suppliedId = scalar(input["notifyId"]);
  const stableId = createHash("sha256")
    .update(JSON.stringify({ notifyType, eventGenerateTime, content }))
    .digest("hex");
  return {
    notifyId: suppliedId === undefined ? stableId : String(suppliedId),
    notifyType,
    ...(eventGenerateTime === undefined ? {} : { eventGenerateTime: String(eventGenerateTime) }),
    content,
  };
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

async function parseRequest(request: Request): Promise<unknown | "probe" | "too-large" | "invalid"> {
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
    try { return JSON.parse(text); } catch { return "invalid"; }
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
        } catch { /* Ignore a partial/corrupt trailing receipt; future receipts remain processable. */ }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  })();
  await persistedLoad;
}

async function receive(request: Request, token: string) {
  const secret = process.env["ESIM_ACCESS_SECRET_KEY"];
  if (!secret) return json({ error: "webhook_unconfigured" }, 503);
  if (!isValidToken(token, secret)) return json({ error: "not_found" }, 404);
  if (request.method === "HEAD") return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });

  const parsed = await parseRequest(request);
  if (parsed === "probe") return json({ ok: true, endpoint: "esim-access-webhook" });
  if (parsed === "too-large") return json({ error: "payload_too_large" }, 413);
  if (parsed === "invalid") return json({ error: "invalid_payload" }, 400);
  const event = normalizeEvent(parsed, secret);
  if (!event) return json({ error: "unsupported_or_invalid_event" }, 400);

  const file = process.env["ESIM_ACCESS_WEBHOOK_LOG_PATH"] || "/var/lib/djiwatravel/esim-access-webhooks.jsonl";
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await loadPersistedReceipts(file);
  if (dedupe.has(event)) return json({ ok: true, duplicate: true });

  const fingerprint = createHash("sha256").update(JSON.stringify(event)).digest("hex");
  if (persistedFingerprints.has(fingerprint)) {
    dedupe.remember(event);
    return json({ ok: true, duplicate: true });
  }

  const receipt = { receivedAt: new Date().toISOString(), fingerprint, event };
  await appendFile(file, `${JSON.stringify(receipt)}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(file, 0o600);
  try {
    const content = event.content ?? {};
    const providerOrderNo = typeof content["orderNo"] === "string" ? content["orderNo"] : null;
    const providerTransactionId = typeof content["transactionId"] === "string" ? content["transactionId"] : null;
    const rawStatus = content["esimStatus"] ?? content["smdpStatus"] ?? content["orderStatus"];
    const profileStatus = mapProviderStatus(rawStatus);
    const providerStatus = rawStatus == null ? null : String(rawStatus).slice(0, 80);
    const result = await db.execute(sql`update public.esim_provisioning_orders
      set provider_status = coalesce(${providerStatus}, provider_status),
          status = case when ${profileStatus} in ('RELEASED','ENABLED','IN_USE','USED_UP','SUSPENDED') then 'READY' when ${profileStatus} in ('REVOKED','CANCELLED') then 'FAILED' else status end,
          last_provider_response = jsonb_build_object('notifyId', ${event.notifyId}, 'notifyType', ${event.notifyType}, 'content', ${JSON.stringify(content)}::jsonb),
          updated_at = now()
      where (${providerOrderNo} is not null and provider_order_no = ${providerOrderNo})
         or (${providerTransactionId} is not null and provider_transaction_id = ${providerTransactionId})
      returning order_id, status`);
    for (const row of result.rows as Array<{ order_id?: string; status?: string }>) {
      if (row.order_id && row.status === "READY") {
        await db.execute(sql`update public.customer_orders set status = 'READY', updated_at = now() where id = ${row.order_id}::uuid and status in ('PROVISIONING','PAYMENT_CONFIRMED')`);
      } else if (row.order_id && row.status === "FAILED") {
        await db.execute(sql`update public.customer_orders set status = 'PROVISIONING_FAILED', updated_at = now() where id = ${row.order_id}::uuid and status = 'PROVISIONING'`);
      }
    }
    const rawInput = recordOf(parsed);
    const rawContent = recordOf(rawInput?.["content"]);
    if (rawContent?.["iccid"]) {
      const profileLookup = await db.execute(sql`select id from public.esim_provisioning_orders where (${providerOrderNo} is not null and provider_order_no = ${providerOrderNo}) or (${providerTransactionId} is not null and provider_transaction_id = ${providerTransactionId}) limit 1`);
      const provisioningOrderId = (profileLookup.rows[0] as { id?: string } | undefined)?.id;
      if (provisioningOrderId) {
        try {
          const protectedProfile = protectProviderProfile(provisioningOrderId, rawContent);
          await db.execute(sql`insert into public.esim_profiles(provisioning_order_id, iccid, activation_code_encrypted, qr_payload_encrypted, profile_status, provider_payload, updated_at)
            values (${provisioningOrderId}::uuid, ${protectedProfile.iccid}, ${protectedProfile.activationCodeEncrypted ?? null}, ${protectedProfile.qrPayloadEncrypted ?? null}, ${protectedProfile.status}, ${JSON.stringify({ notifyId: event.notifyId })}::jsonb, now())
            on conflict (iccid) do update set activation_code_encrypted = excluded.activation_code_encrypted, qr_payload_encrypted = excluded.qr_payload_encrypted, profile_status = excluded.profile_status, updated_at = now()`);
        } catch {
          // Status reconciliation remains valid even when a provider payload has no installable profile.
        }
      }
    }
    await db.execute(sql`insert into public.provider_webhook_events(provider, notify_id, notify_type, event_fingerprint, payload, processed_at)
      values ('esimaccess', ${event.notifyId}, ${event.notifyType}, ${fingerprint}, ${JSON.stringify(event)}::jsonb, now())
      on conflict do nothing`);
  } catch (error) {
    return json({ error: "webhook_processing_failed" }, 503);
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
