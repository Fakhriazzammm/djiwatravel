import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { getCookie, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { buildSettingAudit } from "./admin-settings";
import { getAuthenticatedUser } from "./customer-session.fn";
import { decryptEsimSecret, encryptEsimSecret } from "./esim-secret-crypto";
import { readStoredUsageForOrders } from "./esim-stored-usage.server";
import {
  DEFAULT_ESIM_SHARING_CONFIG,
  ESIM_SHARING_SETTING_KEY,
  normalizeEsimSharingConfig,
  parseEsimSharingConfig,
  shareEligibility,
  SHARE_TOKEN_MAX,
  SHARE_TOKEN_MIN,
  type AdminEsimShareState,
  type EsimSharingConfig,
  type OwnerShareState,
  type SharedEsimLanding,
  type SharedEsimView,
  type ShareLinkSummary,
} from "./esim-share";

const tokenSchema = z
  .string()
  .min(SHARE_TOKEN_MIN)
  .max(SHARE_TOKEN_MAX)
  .regex(/^[A-Za-z0-9_-]+$/, "Token berbagi tidak valid");

const shareTokenSchema = z.object({ token: tokenSchema });
const orderIdSchema = z.object({ orderId: z.string().uuid() });
const saveSchema = z.object({
  config: z.unknown(),
  reason: z.string().trim().min(4).max(300),
  expectedVersion: z.number().int().min(0),
});

export type EsimSharingConfigRecord = { config: EsimSharingConfig; version: number };

/**
 * Shared order/profile read model for both the owner sheet and the public landing.
 *
 * One item and one profile are selected per order so an order with duplicate rows can never turn
 * the bearer-token lookup into several different answers.
 */
const ORDER_STATE_CTE = `
  select o.id as order_id, o.status as order_status, o.public_order_code,
         o.esim_activation_expires_at,
         oi.package_snapshot, oi.package_name_snapshot, oi.provider_package_code,
         po.provider_order_no,
         p.profile_status, p.installable, p.qr_payload_encrypted,
         p.activation_code_encrypted, p.smdp_address, p.activated_at,
         p.expires_at as profile_expires_at
  from public.customer_orders o
  left join lateral (
    select package_snapshot, package_name_snapshot, provider_package_code
    from public.customer_order_items
    where order_id = o.id
    order by id
    limit 1
  ) oi on true
  left join public.esim_provisioning_orders po on po.order_id = o.id
  left join lateral (
    select profile_status, installable, qr_payload_encrypted, activation_code_encrypted,
           smdp_address, activated_at, expires_at
    from public.esim_profiles
    where provisioning_order_id = po.id
    order by (installable is true) desc, created_at desc
    limit 1
  ) p on true
`;

type OrderStateRow = {
  order_id: string;
  order_status: string;
  public_order_code: string;
  esim_activation_expires_at: string | Date | null;
  package_snapshot: unknown;
  package_name_snapshot: string | null;
  provider_package_code: string | null;
  provider_order_no: string | null;
  profile_status: string | null;
  installable: boolean | null;
  qr_payload_encrypted: string | null;
  activation_code_encrypted: string | null;
  smdp_address: string | null;
  activated_at: string | Date | null;
  profile_expires_at: string | Date | null;
};

type ShareRow = OrderStateRow & {
  share_id: string;
  token_encrypted: string;
  share_created_at: string | Date;
  revoked_at: string | Date | null;
  claimed_at: string | Date | null;
  claim_hash: string | null;
  view_count: number | string | null;
  last_opened_at: string | Date | null;
};

type OwnerShareRow = OrderStateRow & {
  share_id: string | null;
  token_encrypted: string | null;
  share_created_at: string | Date | null;
  claimed_at: string | Date | null;
  claim_hash: string | null;
  view_count: number | string | null;
  last_opened_at: string | Date | null;
};

type PackageSnapshot = {
  name: string | null;
  locationCodes: string[];
  durationDays: number;
  volumeBytes: number | null;
  unlimited: boolean;
};

function hashToken(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashesMatch(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function toIso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toMs(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function readPackageSnapshot(value: unknown): PackageSnapshot {
  const snapshot =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return {
    name: typeof snapshot["name"] === "string" ? snapshot["name"] : null,
    locationCodes: Array.isArray(snapshot["locationCodes"])
      ? snapshot["locationCodes"].filter((item): item is string => typeof item === "string")
      : [],
    durationDays: typeof snapshot["durationDays"] === "number" ? snapshot["durationDays"] : 0,
    volumeBytes: typeof snapshot["volumeBytes"] === "number" ? snapshot["volumeBytes"] : null,
    unlimited: snapshot["unlimited"] === true,
  };
}

/** Package validity: provider profile expiry, then activation + duration, then activation window. */
function shareExpiresAtMs(row: OrderStateRow, durationDays: number) {
  const profileExpiry = toMs(row.profile_expires_at);
  if (profileExpiry !== null) return profileExpiry;
  const activatedAt = toMs(row.activated_at);
  if (activatedAt !== null && durationDays > 0) return activatedAt + durationDays * 86_400_000;
  return toMs(row.esim_activation_expires_at);
}

function orderShareState(row: OrderStateRow) {
  const snapshot = readPackageSnapshot(row.package_snapshot);
  const expiresAtMs = shareExpiresAtMs(row, snapshot.durationDays);
  const profileStatus = (row.profile_status ?? "").toUpperCase();
  const installed =
    row.order_status === "INSTALLED" || profileStatus === "IN_USE" || profileStatus === "USED_UP";
  const hasProfile =
    row.installable === true && Boolean(row.qr_payload_encrypted || row.activation_code_encrypted);
  return {
    snapshot,
    expiresAtMs,
    installed,
    hasProfile,
    packageName:
      row.package_name_snapshot ?? snapshot.name ?? row.provider_package_code ?? "Paket eSIM",
    eligibility: shareEligibility({
      status: row.order_status,
      profileStatus: row.profile_status,
      expiresAtMs,
      hasProfile,
    }),
  };
}

function shareLinkSummary(row: ShareRow, token: string): ShareLinkSummary {
  return {
    token,
    createdAt: toIso(row.share_created_at) ?? "",
    claimed: Boolean(row.claim_hash),
    claimedAt: toIso(row.claimed_at),
    viewCount: Number(row.view_count ?? 0),
    lastOpenedAt: toIso(row.last_opened_at),
  };
}

function adminLinkSummary(row: ShareRow): Omit<ShareLinkSummary, "token"> {
  return {
    createdAt: toIso(row.share_created_at) ?? "",
    claimed: Boolean(row.claim_hash),
    claimedAt: toIso(row.claimed_at),
    viewCount: Number(row.view_count ?? 0),
    lastOpenedAt: toIso(row.last_opened_at),
  };
}

function decryptShareToken(row: ShareRow | OwnerShareRow) {
  if (!row.token_encrypted) return null;
  try {
    return decryptEsimSecret(row.token_encrypted);
  } catch {
    console.error("[esim-share] token decrypt failed", { orderId: row.order_id });
    return null;
  }
}

/** Customer-safe read: a missing or unreadable setting keeps sharing on. */
export async function readEsimSharingConfig(): Promise<EsimSharingConfigRecord> {
  try {
    const result = await pool.query(
      "select value_json, version from public.admin_settings where setting_key = $1",
      [ESIM_SHARING_SETTING_KEY],
    );
    const row = result.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    if (!row) return { config: DEFAULT_ESIM_SHARING_CONFIG, version: 0 };
    return {
      config: normalizeEsimSharingConfig(row.value_json),
      version: Number(row.version) || 0,
    };
  } catch {
    return { config: DEFAULT_ESIM_SHARING_CONFIG, version: 0 };
  }
}

async function readOwnerShare(orderId: string, subject: string) {
  const result = await pool.query(
    `with order_state as (
       ${ORDER_STATE_CTE}
       where o.id = $1 and o.customer_auth_subject = $2
     )
     select os.*, s.id as share_id, s.token_encrypted, s.created_at as share_created_at,
            s.claimed_at, s.claim_hash, s.view_count, s.last_opened_at
     from order_state os
     left join lateral (
       select id, token_encrypted, created_at, claimed_at, claim_hash, view_count, last_opened_at
       from public.esim_share_links
       where order_id = os.order_id and revoked_at is null
       order by created_at desc
       limit 1
     ) s on true
     limit 1`,
    [orderId, subject],
  );
  return result.rows[0] as OwnerShareRow | undefined;
}

async function readShareByToken(token: string) {
  const result = await pool.query(
    `with order_state as (
       ${ORDER_STATE_CTE}
     )
     select os.*, s.id as share_id, s.token_encrypted, s.created_at as share_created_at,
            s.revoked_at, s.claimed_at, s.claim_hash, s.view_count, s.last_opened_at
     from public.esim_share_links s
     join order_state os on os.order_id = s.order_id
     where s.token_hash = $1
     limit 1`,
    [hashToken(token)],
  );
  return result.rows[0] as ShareRow | undefined;
}

async function readAdminShare(orderId: string) {
  const result = await pool.query(
    `with order_state as (
       ${ORDER_STATE_CTE}
       where o.id = $1
     )
     select os.*, s.id as share_id, s.token_encrypted, s.created_at as share_created_at,
            s.claimed_at, s.claim_hash, s.view_count, s.last_opened_at
     from order_state os
     left join lateral (
       select id, token_encrypted, created_at, claimed_at, claim_hash, view_count, last_opened_at
       from public.esim_share_links
       where order_id = os.order_id and revoked_at is null
       order by created_at desc
       limit 1
     ) s on true
     limit 1`,
    [orderId],
  );
  return result.rows[0] as OwnerShareRow | undefined;
}

export const getEsimShareStateInput = (data: unknown) => orderIdSchema.parse(data);

export async function getEsimShareStateHandler({
  data,
}: {
  data: ReturnType<typeof getEsimShareStateInput>;
}): Promise<OwnerShareState> {
  const user = await getAuthenticatedUser();
  const config = await readEsimSharingConfig();
  let row: OwnerShareRow | undefined;
  try {
    row = await readOwnerShare(data.orderId, user.id);
  } catch (error) {
    console.error("[esim-share] owner state failed", {
      reason: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return { enabled: false, eligible: false, link: null };
  }
  if (!row) throw new Error("eSIM tidak ditemukan");
  const state = orderShareState(row);
  const token = decryptShareToken(row);
  return {
    enabled: config.config.enabled,
    eligible: state.eligibility === "ok",
    link: token && row.share_id ? shareLinkSummary(row as ShareRow, token) : null,
  };
}

export const createEsimShareLinkInput = (data: unknown) => orderIdSchema.parse(data);

export async function createEsimShareLinkHandler({
  data,
}: {
  data: ReturnType<typeof createEsimShareLinkInput>;
}) {
  const user = await getAuthenticatedUser();
  const config = await readEsimSharingConfig();
  if (!config.config.enabled) throw new Error("Berbagi eSIM sedang dinonaktifkan admin");
  const row = await readOwnerShare(data.orderId, user.id);
  if (!row) throw new Error("eSIM tidak ditemukan");
  const state = orderShareState(row);
  if (state.eligibility === "ended")
    throw new Error("Masa berlaku eSIM ini sudah berakhir, jadi tidak bisa dibagikan");
  if (state.eligibility === "not_ready")
    throw new Error("eSIM ini belum siap dibagikan. Tunggu sampai eSIM siap dipasang.");

  const token = randomBytes(24).toString("base64url");
  const tokenHash = hashToken(token);
  const tokenEncrypted = encryptEsimSecret(token);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `update public.esim_share_links
       set revoked_at = now(), revoked_by = $2, revoke_reason = 'replaced'
       where order_id = $1 and revoked_at is null`,
      [data.orderId, user.id],
    );
    const inserted = await client.query(
      `insert into public.esim_share_links (order_id, token_hash, token_encrypted, created_by)
       values ($1, $2, $3, $4)
       on conflict (order_id) where revoked_at is null do nothing
       returning created_at`,
      [data.orderId, tokenHash, tokenEncrypted, user.id],
    );
    if (!inserted.rows[0]) {
      await client.query("rollback");
      throw new Error("Link berbagi sedang dibuat. Coba lagi sebentar.");
    }
    await client.query("commit");
    return {
      token,
      createdAt: toIso(inserted.rows[0].created_at as string | Date) ?? new Date().toISOString(),
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export const revokeEsimShareLinkInput = (data: unknown) => orderIdSchema.parse(data);

export async function revokeEsimShareLinkHandler({
  data,
}: {
  data: ReturnType<typeof revokeEsimShareLinkInput>;
}) {
  const user = await getAuthenticatedUser();
  const result = await pool.query(
    `update public.esim_share_links s
     set revoked_at = now(), revoked_by = $2, revoke_reason = 'owner'
     from public.customer_orders o
     where s.order_id = o.id and s.order_id = $1
       and o.customer_auth_subject = $2 and s.revoked_at is null
     returning s.id`,
    [data.orderId, user.id],
  );
  return { revoked: Boolean(result.rows[0]) };
}

function claimCookieName(token: string) {
  return `djiwa_esim_share_${hashToken(token).slice(0, 12)}`;
}

function claimCookieValue(token: string) {
  try {
    return getCookie(claimCookieName(token));
  } catch {
    // Direct calls outside a request (tests, scripts) simply have no claim cookie.
    return undefined;
  }
}

function setClaimCookie(token: string, value: string) {
  setCookie(claimCookieName(token), value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    // The link lives as long as the package; a 30-day cookie would lock a long package out of its
    // own QR. Eligibility is still re-checked on every read, so an ended package stays closed.
    maxAge: 60 * 60 * 24 * 365,
  });
}

function availablePreview(row: ShareRow, state: ReturnType<typeof orderShareState>) {
  return {
    packageName: state.packageName,
    locationCodes: state.snapshot.locationCodes,
    durationDays: state.snapshot.durationDays,
    quotaBytes: state.snapshot.volumeBytes,
    unlimited: state.snapshot.unlimited,
  };
}

async function openView(row: ShareRow): Promise<SharedEsimView> {
  const state = orderShareState(row);
  const usageMap = row.provider_order_no
    ? await readStoredUsageForOrders([row.provider_order_no])
    : new Map();
  const usage = row.provider_order_no ? usageMap.get(row.provider_order_no) : undefined;
  const qrPayload = row.qr_payload_encrypted ? decryptEsimSecret(row.qr_payload_encrypted) : "";
  const activationCode = row.activation_code_encrypted
    ? decryptEsimSecret(row.activation_code_encrypted)
    : (qrPayload.split("$")[2] ?? "");
  const smdp =
    row.smdp_address ?? (qrPayload.startsWith("LPA:") ? (qrPayload.split("$")[1] ?? "") : "");
  const lpa =
    qrPayload ||
    (smdp && activationCode
      ? `LPA:1$${smdp}$${activationCode}`
      : activationCode.toUpperCase().startsWith("LPA:")
        ? activationCode
        : "");
  return {
    packageName: state.packageName,
    locationCodes: state.snapshot.locationCodes,
    durationDays: state.snapshot.durationDays,
    quotaBytes: state.snapshot.volumeBytes,
    unlimited: state.snapshot.unlimited,
    expiresAtMs: state.expiresAtMs,
    installed: state.installed,
    usage: usage
      ? {
          totalBytes: usage.totalBytes ?? null,
          usedBytes: usage.usedBytes,
          remainingBytes:
            usage.totalBytes === undefined ? null : Math.max(usage.totalBytes - usage.usedBytes, 0),
          measuredAt: usage.measuredAtMs ?? null,
        }
      : null,
    esim: { lpa, smdp, activationCode },
  };
}

/**
 * Public read model. Invalid, revoked, ended and disabled links all answer the same way so the
 * page cannot be used to probe whether an order exists.
 */
export async function loadSharedEsim(
  token: string,
  claimValue = claimCookieValue(token),
): Promise<SharedEsimLanding> {
  if (!tokenSchema.safeParse(token).success) return { state: "unavailable" };
  const config = await readEsimSharingConfig();
  if (!config.config.enabled) return { state: "unavailable" };
  const row = await readShareByToken(token);
  if (!row || row.revoked_at) return { state: "unavailable" };
  const state = orderShareState(row);
  if (state.eligibility !== "ok") return { state: "unavailable" };

  if (row.claim_hash) {
    if (!claimValue || !hashesMatch(hashToken(claimValue), row.claim_hash))
      return { state: "claimed_elsewhere" };
    // Counting a read is useful for the owner but must never block the QR itself.
    await pool
      .query(
        `update public.esim_share_links
         set view_count = view_count + 1, last_opened_at = now()
         where id = $1`,
        [row.share_id],
      )
      .catch(() => undefined);
    return { state: "open", view: await openView(row) };
  }

  return { state: "available", preview: availablePreview(row, state) };
}

export const getSharedEsimInput = (data: unknown) => shareTokenSchema.parse(data);

export async function getSharedEsimHandler({
  data,
}: {
  data: ReturnType<typeof getSharedEsimInput>;
}) {
  return loadSharedEsim(data.token);
}

export const claimSharedEsimInput = (data: unknown) => shareTokenSchema.parse(data);

export async function claimSharedEsimHandler({
  data,
}: {
  data: ReturnType<typeof claimSharedEsimInput>;
}) {
  const config = await readEsimSharingConfig();
  if (!config.config.enabled) return { state: "unavailable" } as const;
  const claimValue = randomBytes(32).toString("base64url");
  const claimed = await pool.query(
    `update public.esim_share_links
     set claimed_at = now(), claim_hash = $2
     where token_hash = $1 and revoked_at is null
       and claimed_at is null and claim_hash is null
     returning id`,
    [hashToken(data.token), hashToken(claimValue)],
  );
  if (claimed.rows[0]) setClaimCookie(data.token, claimValue);
  return loadSharedEsim(data.token, claimed.rows[0] ? claimValue : claimCookieValue(data.token));
}

/* ------------------------------------------------------------------ admin */

export const getAdminEsimSharingHandler = async () => {
  await requireAdmin();
  return readEsimSharingConfig();
};

export const saveEsimSharingConfigInput = (data: unknown) => saveSchema.parse(data);

export async function saveEsimSharingConfigHandler({
  data,
}: {
  data: ReturnType<typeof saveEsimSharingConfigInput>;
}) {
  await requireAdmin();
  const config = parseEsimSharingConfig(data.config);
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select value_json, version from public.admin_settings where setting_key = $1 for update",
      [ESIM_SHARING_SETTING_KEY],
    );
    const row = current.rows[0] as { value_json?: unknown; version?: unknown } | undefined;
    const version = row ? Number(row.version) : 0;
    if (version !== data.expectedVersion) {
      await client.query("rollback");
      return { ok: false as const, conflict: true as const, version };
    }
    const audit = buildSettingAudit(
      ESIM_SHARING_SETTING_KEY,
      row?.value_json ?? null,
      config,
      actor,
      data.reason,
    );
    await client.query(
      `insert into public.admin_settings (setting_key, value_json, version, updated_at)
       values ($1, $2::jsonb, 1, now())
       on conflict (setting_key) do update
       set value_json = excluded.value_json, version = admin_settings.version + 1, updated_at = now()`,
      [ESIM_SHARING_SETTING_KEY, JSON.stringify(config)],
    );
    await client.query(
      `insert into public.admin_audit_logs
         (id, action, entity_type, entity_id, reason, before_json, after_json)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)`,
      [
        randomUUID(),
        audit.action,
        audit.entityType,
        audit.entityId,
        `${actor}: ${audit.reason}`,
        JSON.stringify(audit.beforeJson),
        JSON.stringify(audit.afterJson),
      ],
    );
    await client.query("commit");
    return { ok: true as const, conflict: false as const, version: version + 1, config };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export const getAdminEsimShareStateInput = (data: unknown) => orderIdSchema.parse(data);

export async function getAdminEsimShareStateHandler({
  data,
}: {
  data: ReturnType<typeof getAdminEsimShareStateInput>;
}): Promise<AdminEsimShareState | null> {
  await requireAdmin();
  const row = await readAdminShare(data.orderId);
  if (!row) return null;
  const config = await readEsimSharingConfig();
  const state = orderShareState(row);
  return {
    enabled: config.config.enabled,
    eligible: state.eligibility === "ok",
    link: row.share_id ? adminLinkSummary(row as ShareRow) : null,
  };
}

export const revokeAdminEsimShareInput = (data: unknown) => orderIdSchema.parse(data);

export async function revokeAdminEsimShareHandler({
  data,
}: {
  data: ReturnType<typeof revokeAdminEsimShareInput>;
}) {
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const result = await pool.query(
    `update public.esim_share_links
     set revoked_at = now(), revoked_by = $2, revoke_reason = 'admin'
     where order_id = $1 and revoked_at is null
     returning id`,
    [data.orderId, actor],
  );
  if (result.rows[0]) {
    await pool.query(
      `insert into public.admin_audit_logs
         (id, action, entity_type, entity_id, reason, before_json, after_json)
       values ($1, 'order.share_revoke', 'customer_order', $2, $3, $4::jsonb, $5::jsonb)`,
      [
        randomUUID(),
        data.orderId,
        `${actor}: mencabut link berbagi eSIM`,
        JSON.stringify({ active: true }),
        JSON.stringify({ active: false }),
      ],
    );
  }
  return { revoked: Boolean(result.rows[0]) };
}
