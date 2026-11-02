import { createHash, randomInt } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAdminEmailHandler } from "./admin-guard.server";
import { recordAdminAction } from "./admin-audit.server";
import { maskEmail } from "./admin-display";
import {
  AFFILIATE_SETTING_KEY,
  DEFAULT_AFFILIATE_CONFIG,
  generateAffiliateCode,
  maskAccountNumber,
  maskedReferee,
  normalizeAffiliateCode,
  normalizeAffiliateConfig,
  parseAffiliateConfig,
  parseBankDestination,
  validateCustomCode,
  type AffiliateConfig,
} from "./affiliate";

/* ------------------------------------------------------------------ config */

export type AffiliateConfigRecord = { config: AffiliateConfig; version: number };

/** Customer-safe read: any failure falls back to defaults so the program never breaks a page. */
export async function readAffiliateConfig(): Promise<AffiliateConfigRecord> {
  try {
    const result = await pool.query(
      "select value_json, version from admin_settings where setting_key = $1",
      [AFFILIATE_SETTING_KEY],
    );
    const row = result.rows[0];
    if (!row) return { config: DEFAULT_AFFILIATE_CONFIG, version: 0 };
    return { config: normalizeAffiliateConfig(row.value_json), version: Number(row.version) || 0 };
  } catch {
    return { config: DEFAULT_AFFILIATE_CONFIG, version: 0 };
  }
}

const saveConfigSchema = z.object({
  config: z.unknown(),
  reason: z.string().trim().min(4).max(300),
  expectedVersion: z.number().int().min(0),
});
export const saveAffiliateConfigInput = (data: unknown) => saveConfigSchema.parse(data);

export async function saveAffiliateConfigHandler({ data }: { data: unknown }) {
  const input = saveAffiliateConfigInput(data);
  await requireAdmin();
  const config = parseAffiliateConfig(input.config);
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await client.query(
      "select value_json, version from admin_settings where setting_key = $1 for update",
      [AFFILIATE_SETTING_KEY],
    );
    const row = current.rows[0];
    const version = row ? Number(row.version) : 0;
    if (version !== input.expectedVersion) {
      await client.query("rollback");
      return { ok: false as const, conflict: true as const, version };
    }
    await client.query(
      `insert into admin_settings (setting_key, value_json, version, updated_at)
       values ($1, $2::jsonb, 1, now())
       on conflict (setting_key) do update
       set value_json = excluded.value_json, version = admin_settings.version + 1, updated_at = now()`,
      [AFFILIATE_SETTING_KEY, JSON.stringify(config)],
    );
    await recordAdminAction(
      {
        actor,
        action: "settings.change",
        entityType: "admin_setting",
        entityId: AFFILIATE_SETTING_KEY,
        reason: input.reason,
        before: row?.value_json ?? null,
        after: config,
      },
      client,
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

/* ----------------------------------------------------------------- helpers */

async function currentUser() {
  const { getAuthenticatedUser } = await import("./customer-session.fn");
  return getAuthenticatedUser();
}

async function notify(
  subject: string,
  eventKey: string,
  title: string,
  body: string,
  href = "/affiliate",
) {
  try {
    const { createCustomerNotification } = await import("./push.server");
    await createCustomerNotification({
      subject,
      type: "affiliate",
      title,
      body,
      href,
      eventKey,
      source: "affiliate",
    });
  } catch (error) {
    console.error("[travel] affiliate notification skipped", {
      reason: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
  }
}

async function visitorHash(): Promise<string> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const ip = (getRequestHeader("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? "";
  const ua = getRequestHeader("user-agent") ?? "";
  const salt = process.env["AFFILIATE_HASH_SALT"] ?? "djiwa-affiliate";
  return createHash("sha256").update(`${salt}|${ip}|${ua}`).digest("hex").slice(0, 32);
}

const SETTLED_EXCLUDED = `('DRAFT','ORDER_CREATED','PAYMENT_PENDING','CANCELLED','REFUNDED')`;
const MATURE_EXCLUDED = `('DRAFT','ORDER_CREATED','PAYMENT_PENDING','PROVISIONING_FAILED','CANCELLED','REFUNDED')`;
const REFUND_STATUSES = `('APPROVED','PROVIDER_PENDING','REFUNDED','PROVIDER_REFUNDED')`;

/* ------------------------------------------------------------------- sweep */

export type AffiliateSweepReport = {
  skipped: boolean;
  accrued: number;
  approved: number;
  reversed: number;
};

/**
 * Idempotent accrual / maturity / reversal pass. Commissions are derived from settled orders
 * (unique per order), so payment webhooks and retries never double-count and the payment code
 * paths stay untouched. A transaction-level advisory lock makes concurrent callers skip.
 */
export async function runAffiliateSweep(): Promise<AffiliateSweepReport> {
  const { config } = await readAffiliateConfig();
  const client = await pool.connect();
  const approvedRows: Array<{ id: string; subject: string; amount: number }> = [];
  const report: AffiliateSweepReport = { skipped: false, accrued: 0, approved: 0, reversed: 0 };
  try {
    await client.query("begin");
    const lock = await client.query(
      "select pg_try_advisory_xact_lock(hashtext('djiwa-affiliate-sweep')) as ok",
    );
    if (!lock.rows[0]?.ok) {
      await client.query("commit");
      return { ...report, skipped: true };
    }

    if (config.enabled) {
      const accrued = await client.query(
        `insert into affiliate_commissions
           (referral_id, affiliate_id, order_id, base_amount, percent, amount_idr, status, matures_at)
         select r.id, a.id, o.id, o.markup_amount,
                coalesce(a.commission_percent_override, $1::numeric),
                floor(o.markup_amount * coalesce(a.commission_percent_override, $1::numeric) / 100)::bigint,
                'pending', o.paid_at + make_interval(days => $2::int)
           from affiliate_referrals r
           join affiliate_accounts a on a.id = r.affiliate_id and a.status = 'active'
           join customer_orders o on o.id = (
                  select f.id from customer_orders f
                   where f.customer_auth_subject = r.referee_auth_subject and f.paid_at is not null
                   order by f.paid_at, f.id limit 1)
          where not r.flagged
            and o.status not in ${SETTLED_EXCLUDED}
            and floor(o.markup_amount * coalesce(a.commission_percent_override, $1::numeric) / 100) > 0
         on conflict (order_id) do nothing
         returning id`,
        [config.commissionPercent, config.holdDays],
      );
      report.accrued = accrued.rowCount ?? 0;
    }

    const reversed = await client.query(
      `update affiliate_commissions c
          set status = 'reversed', reason = coalesce(c.reason, 'Order direfund atau dibatalkan'), updated_at = now()
         from customer_orders o
        where o.id = c.order_id and c.status in ('pending','approved')
          and (o.status in ('REFUNDED','CANCELLED')
               or exists (select 1 from refund_requests rr where rr.order_id = o.id and rr.status in ${REFUND_STATUSES}))
        returning c.id`,
    );
    report.reversed = reversed.rowCount ?? 0;
    if (report.reversed > 0) await rebalanceOpenPayouts(client);

    const approved = await client.query(
      `update affiliate_commissions c
          set status = 'approved', updated_at = now()
         from customer_orders o, affiliate_accounts a
        where o.id = c.order_id and a.id = c.affiliate_id and a.status = 'active'
          and c.status = 'pending' and c.matures_at <= now()
          and o.status not in ${MATURE_EXCLUDED}
        returning c.id, c.amount_idr, a.customer_auth_subject as subject`,
    );
    report.approved = approved.rowCount ?? 0;
    for (const row of approved.rows)
      approvedRows.push({ id: row.id, subject: row.subject, amount: Number(row.amount_idr) });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  for (const row of approvedRows)
    await notify(
      row.subject,
      `affiliate-commission-approved:${row.id}`,
      "Komisi affiliate disetujui",
      `Komisi Rp${row.amount.toLocaleString("id-ID")} sekarang bisa ditarik.`,
    );
  return report;
}

type Queryable = {
  query: (
    text: string,
    values?: unknown[],
  ) => Promise<{ rowCount: number | null; rows: unknown[] }>;
};

/** A reversed commission shrinks (or cancels) the open payout that already included it. */
async function rebalanceOpenPayouts(client: Queryable) {
  await client.query(
    `update affiliate_payouts p set amount_idr = s.total, updated_at = now()
       from (select payout_id, sum(amount_idr) as total from affiliate_commissions
              where payout_id is not null and status = 'approved' group by payout_id) s
      where p.id = s.payout_id and p.status in ('requested','approved') and p.amount_idr <> s.total`,
  );
  await client.query(
    `update affiliate_payouts p set status = 'rejected', note = 'Semua komisi dibatalkan', updated_at = now()
      where p.status in ('requested','approved')
        and not exists (select 1 from affiliate_commissions c where c.payout_id = p.id and c.status = 'approved')`,
  );
}

/* ------------------------------------------------------- customer: tracking */

export async function trackAffiliateClickHandler({ data }: { data: unknown }) {
  const { code: rawCode, path } = z
    .object({ code: z.string().max(40), path: z.string().max(200).optional() })
    .parse(data);
  const code = normalizeAffiliateCode(rawCode);
  if (!code) return { valid: false };
  const { config } = await readAffiliateConfig();
  if (!config.enabled) return { valid: false };
  const found = await pool.query(
    "select id from affiliate_accounts where code = $1 and status = 'active'",
    [code],
  );
  const id = found.rows[0]?.id as string | undefined;
  if (!id) return { valid: false };
  await pool
    .query(
      `insert into affiliate_clicks (affiliate_id, visitor_hash, landing_path)
       values ($1, $2, $3) on conflict (affiliate_id, visitor_hash, click_day) do nothing`,
      [id, await visitorHash(), path?.slice(0, 200) ?? null],
    )
    .catch(() => undefined);
  return { valid: true, cookieDays: config.cookieDays };
}

export type ClaimStatus =
  "claimed" | "already" | "invalid" | "self" | "not_new" | "disabled" | "signed_out";

/** Locks referrer → referee once. The referee is always the verified session user. */
export async function claimAffiliateReferralHandler({
  data,
}: {
  data: unknown;
}): Promise<{ status: ClaimStatus }> {
  const { code: rawCode } = z.object({ code: z.string().max(40) }).parse(data);
  const code = normalizeAffiliateCode(rawCode);
  if (!code) return { status: "invalid" };
  let user: { id: string; email: string };
  try {
    user = await currentUser();
  } catch {
    return { status: "signed_out" };
  }
  const { config } = await readAffiliateConfig();
  if (!config.enabled) return { status: "disabled" };
  const account = await pool.query(
    `select a.id, a.customer_auth_subject as subject, lower(p.email) as email
       from affiliate_accounts a left join customer_profiles p on p.auth_user_id = a.customer_auth_subject
      where a.code = $1 and a.status = 'active'`,
    [code],
  );
  const referrer = account.rows[0] as
    { id: string; subject: string; email: string | null } | undefined;
  if (!referrer) return { status: "invalid" };
  if (
    referrer.subject === user.id ||
    (referrer.email && referrer.email === user.email.toLowerCase())
  )
    return { status: "self" };
  const existing = await pool.query(
    "select 1 from affiliate_referrals where referee_auth_subject = $1",
    [user.id],
  );
  if (existing.rowCount) return { status: "already" };
  const bought = await pool.query(
    "select 1 from customer_orders where customer_auth_subject = $1 and paid_at is not null limit 1",
    [user.id],
  );
  if (bought.rowCount) return { status: "not_new" };

  const hash = await visitorHash();
  const inserted = await pool.query(
    `insert into affiliate_referrals (affiliate_id, referee_auth_subject, claim_hash)
     values ($1, $2, $3) on conflict (referee_auth_subject) do nothing returning id`,
    [referrer.id, user.id, hash],
  );
  const referralId = inserted.rows[0]?.id as string | undefined;
  if (!referralId) return { status: "already" };
  // Several accounts for one affiliate from the same device is the cheapest abuse pattern: hold them.
  await pool.query(
    `update affiliate_referrals set flagged = true, flag_reason = 'Banyak akun dari perangkat yang sama'
      where affiliate_id = $1 and claim_hash = $2
        and (select count(*) from affiliate_referrals where affiliate_id = $1 and claim_hash = $2) >= 3`,
    [referrer.id, hash],
  );
  await notify(
    referrer.subject,
    `affiliate-referral:${referralId}`,
    "Teman baru bergabung",
    "Seseorang mendaftar lewat kode affiliate kamu.",
  );
  return { status: "claimed" };
}

/* ------------------------------------------------------ customer: dashboard */

export type AffiliateDashboard =
  | { state: "signed_out" }
  | {
      state: "ready";
      config: Pick<
        AffiliateConfig,
        "enabled" | "commissionPercent" | "holdDays" | "minPayoutIdr" | "cookieDays"
      >;
      account: null | {
        code: string;
        status: "active" | "suspended";
        canChangeCode: boolean;
        percent: number;
        hasBankDestination: boolean;
      };
      stats: {
        clicks: number;
        referrals: number;
        pendingIdr: number;
        availableIdr: number;
        requestedIdr: number;
        paidIdr: number;
      };
      referrals: Array<{ id: string; name: string; lockedAt: string; ordered: boolean }>;
      commissions: Array<{
        id: string;
        amountIdr: number;
        status: string;
        maturesAt: string;
        createdAt: string;
      }>;
      payouts: Array<{
        id: string;
        amountIdr: number;
        status: string;
        method: string;
        reference: string | null;
        note: string | null;
        createdAt: string;
      }>;
    };

export async function getAffiliateDashboardHandler(): Promise<AffiliateDashboard> {
  let user: { id: string; email: string };
  try {
    user = await currentUser();
  } catch {
    return { state: "signed_out" };
  }
  await runAffiliateSweep().catch((error) =>
    console.error("[travel] affiliate sweep failed", {
      reason: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    }),
  );
  const { config } = await readAffiliateConfig();
  const publicConfig = {
    enabled: config.enabled,
    commissionPercent: config.commissionPercent,
    holdDays: config.holdDays,
    minPayoutIdr: config.minPayoutIdr,
    cookieDays: config.cookieDays,
  };
  const found = await pool.query(
    `select id, code, status, code_changed_at, commission_percent_override from affiliate_accounts
      where customer_auth_subject = $1`,
    [user.id],
  );
  const row = found.rows[0];
  const empty = {
    clicks: 0,
    referrals: 0,
    pendingIdr: 0,
    availableIdr: 0,
    requestedIdr: 0,
    paidIdr: 0,
  };
  if (!row)
    return {
      state: "ready",
      config: publicConfig,
      account: null,
      stats: empty,
      referrals: [],
      commissions: [],
      payouts: [],
    };

  const id = row.id as string;
  const [stats, referrals, commissions, payouts, lastBank] = await Promise.all([
    pool.query(
      `select
         (select count(*) from affiliate_clicks where affiliate_id = $1) as clicks,
         (select count(*) from affiliate_referrals where affiliate_id = $1) as referrals,
         coalesce((select sum(amount_idr) from affiliate_commissions where affiliate_id = $1 and status = 'pending'), 0) as pending,
         coalesce((select sum(amount_idr) from affiliate_commissions where affiliate_id = $1 and status = 'approved' and payout_id is null), 0) as available,
         coalesce((select sum(amount_idr) from affiliate_commissions where affiliate_id = $1 and status = 'approved' and payout_id is not null), 0) as requested,
         coalesce((select sum(amount_idr) from affiliate_commissions where affiliate_id = $1 and status = 'paid'), 0) as paid`,
      [id],
    ),
    pool.query(
      `select r.id, r.locked_at, p.display_name,
              exists (select 1 from affiliate_commissions c where c.referral_id = r.id) as ordered
         from affiliate_referrals r left join customer_profiles p on p.auth_user_id = r.referee_auth_subject
        where r.affiliate_id = $1 order by r.locked_at desc limit 50`,
      [id],
    ),
    pool.query(
      `select id, amount_idr, status, matures_at, created_at from affiliate_commissions
        where affiliate_id = $1 order by created_at desc limit 50`,
      [id],
    ),
    pool.query(
      `select id, amount_idr, status, method, reference, note, created_at from affiliate_payouts
        where affiliate_id = $1 order by created_at desc limit 20`,
      [id],
    ),
    pool.query(
      `select 1 from affiliate_payouts where affiliate_id = $1 and method = 'bank' limit 1`,
      [id],
    ),
  ]);
  const s = stats.rows[0];
  return {
    state: "ready",
    config: publicConfig,
    account: {
      code: row.code,
      status: row.status,
      canChangeCode: !row.code_changed_at,
      percent:
        row.commission_percent_override === null
          ? config.commissionPercent
          : Number(row.commission_percent_override),
      hasBankDestination: Boolean(lastBank.rowCount),
    },
    stats: {
      clicks: Number(s.clicks),
      referrals: Number(s.referrals),
      pendingIdr: Number(s.pending),
      availableIdr: Number(s.available),
      requestedIdr: Number(s.requested),
      paidIdr: Number(s.paid),
    },
    referrals: referrals.rows.map((r) => ({
      id: r.id,
      name: maskedReferee(r.display_name),
      lockedAt: new Date(r.locked_at).toISOString(),
      ordered: r.ordered,
    })),
    commissions: commissions.rows.map((c) => ({
      id: c.id,
      amountIdr: Number(c.amount_idr),
      status: c.status,
      maturesAt: new Date(c.matures_at).toISOString(),
      createdAt: new Date(c.created_at).toISOString(),
    })),
    payouts: payouts.rows.map((p) => ({
      id: p.id,
      amountIdr: Number(p.amount_idr),
      status: p.status,
      method: p.method,
      reference: p.reference,
      note: p.note,
      createdAt: new Date(p.created_at).toISOString(),
    })),
  };
}

/* --------------------------------------------------- customer: mutations */

export async function activateAffiliateHandler({ data }: { data: unknown }) {
  z.object({ acceptTerms: z.literal(true) }).parse(data);
  const user = await currentUser();
  const { config } = await readAffiliateConfig();
  if (!config.enabled) throw new Error("Program affiliate sedang tidak aktif");
  const existing = await pool.query(
    "select code from affiliate_accounts where customer_auth_subject = $1",
    [user.id],
  );
  if (existing.rows[0]) return { code: existing.rows[0].code as string, created: false };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateAffiliateCode((max) => randomInt(max));
    const result = await pool.query(
      `insert into affiliate_accounts (customer_auth_subject, code) values ($1, $2)
       on conflict do nothing returning code`,
      [user.id, code],
    );
    if (result.rows[0]) return { code: result.rows[0].code as string, created: true };
    const again = await pool.query(
      "select code from affiliate_accounts where customer_auth_subject = $1",
      [user.id],
    );
    if (again.rows[0]) return { code: again.rows[0].code as string, created: false };
  }
  throw new Error("Gagal membuat kode affiliate, coba lagi");
}

export async function changeAffiliateCodeHandler({ data }: { data: unknown }) {
  const { code: raw } = z.object({ code: z.string().max(40) }).parse(data);
  const code = validateCustomCode(raw);
  const user = await currentUser();
  try {
    const result = await pool.query(
      `update affiliate_accounts set code = $2, code_changed_at = now(), updated_at = now()
        where customer_auth_subject = $1 and code_changed_at is null and status = 'active'
        returning code`,
      [user.id, code],
    );
    if (!result.rows[0]) throw new Error("Kode hanya bisa diganti satu kali");
    return { code };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new Error("Kode sudah dipakai");
    throw error;
  }
}

const payoutSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("djiwa_pay") }),
  z.object({ method: z.literal("bank"), bank: z.unknown() }),
]);

export async function requestAffiliatePayoutHandler({ data }: { data: unknown }) {
  const input = payoutSchema.parse(data);
  const destination = input.method === "bank" ? parseBankDestination(input.bank) : {};
  const user = await currentUser();
  const { config } = await readAffiliateConfig();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const account = await client.query(
      "select id, status from affiliate_accounts where customer_auth_subject = $1 for update",
      [user.id],
    );
    const row = account.rows[0];
    if (!row) throw new Error("Akun affiliate belum aktif");
    if (row.status !== "active") throw new Error("Akun affiliate sedang ditangguhkan");
    const open = await client.query(
      "select 1 from affiliate_payouts where affiliate_id = $1 and status in ('requested','approved')",
      [row.id],
    );
    if (open.rowCount) throw new Error("Masih ada penarikan yang diproses");
    const available = await client.query(
      `select id, amount_idr from affiliate_commissions
        where affiliate_id = $1 and status = 'approved' and payout_id is null for update`,
      [row.id],
    );
    const total = available.rows.reduce((sum, r) => sum + Number(r.amount_idr), 0);
    if (total <= 0 || total < config.minPayoutIdr)
      throw new Error(`Minimal penarikan Rp${config.minPayoutIdr.toLocaleString("id-ID")}`);
    const payout = await client.query(
      `insert into affiliate_payouts (affiliate_id, amount_idr, method, destination)
       values ($1, $2, $3, $4::jsonb) returning id`,
      [row.id, total, input.method, JSON.stringify(destination)],
    );
    await client.query(
      "update affiliate_commissions set payout_id = $2, updated_at = now() where id = any($1::uuid[])",
      [available.rows.map((r) => r.id), payout.rows[0].id],
    );
    await client.query("commit");
    return { payoutId: payout.rows[0].id as string, amountIdr: total };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    if ((error as { code?: string }).code === "23505")
      throw new Error("Masih ada penarikan yang diproses");
    throw error;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------------------------- admin */

const toIso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

export async function getAdminAffiliatesHandler() {
  await requireAdmin();
  await runAffiliateSweep().catch(() => undefined);
  const { config, version } = await readAffiliateConfig();
  const [accounts, payouts, flagged, commissions, totals] = await Promise.all([
    pool.query(
      `select a.id, a.code, a.status, a.suspended_reason, a.commission_percent_override, a.created_at, p.email,
         (select count(*) from affiliate_clicks k where k.affiliate_id = a.id) as clicks,
         (select count(*) from affiliate_referrals r where r.affiliate_id = a.id) as referrals,
         coalesce((select sum(amount_idr) from affiliate_commissions c where c.affiliate_id = a.id and c.status = 'pending'), 0) as pending,
         coalesce((select sum(amount_idr) from affiliate_commissions c where c.affiliate_id = a.id and c.status = 'approved'), 0) as approved,
         coalesce((select sum(amount_idr) from affiliate_commissions c where c.affiliate_id = a.id and c.status = 'paid'), 0) as paid
         from affiliate_accounts a left join customer_profiles p on p.auth_user_id = a.customer_auth_subject
        order by a.created_at desc limit 200`,
    ),
    pool.query(
      `select y.id, y.amount_idr, y.method, y.destination, y.status, y.reference, y.note, y.created_at, y.reviewed_by,
              a.code, p.email,
              (select count(*) from affiliate_referrals r where r.affiliate_id = a.id and r.flagged) as flagged
         from affiliate_payouts y join affiliate_accounts a on a.id = y.affiliate_id
         left join customer_profiles p on p.auth_user_id = a.customer_auth_subject
        order by (y.status in ('requested','approved')) desc, y.created_at desc limit 100`,
    ),
    pool.query(
      `select r.id, r.flag_reason, r.locked_at, a.code, p.email
         from affiliate_referrals r join affiliate_accounts a on a.id = r.affiliate_id
         left join customer_profiles p on p.auth_user_id = r.referee_auth_subject
        where r.flagged order by r.locked_at desc limit 100`,
    ),
    pool.query(
      `select c.id, c.amount_idr, c.percent, c.status, c.reason, c.matures_at, c.created_at, c.payout_id,
              a.code, o.public_order_code, o.id as order_id
         from affiliate_commissions c join affiliate_accounts a on a.id = c.affiliate_id
         join customer_orders o on o.id = c.order_id
        order by c.created_at desc limit 100`,
    ),
    pool.query(
      `select
         (select count(*) from affiliate_accounts) as accounts,
         (select count(*) from affiliate_referrals) as referrals,
         coalesce((select sum(amount_idr) from affiliate_commissions where status in ('pending','approved')), 0) as liability,
         coalesce((select sum(amount_idr) from affiliate_commissions where status = 'paid'), 0) as paid`,
    ),
  ]);
  const t = totals.rows[0];
  return {
    config,
    version,
    totals: {
      accounts: Number(t.accounts),
      referrals: Number(t.referrals),
      liabilityIdr: Number(t.liability),
      paidIdr: Number(t.paid),
    },
    accounts: accounts.rows.map((a) => ({
      id: a.id as string,
      code: a.code as string,
      status: a.status as "active" | "suspended",
      suspendedReason: (a.suspended_reason as string | null) ?? null,
      percentOverride:
        a.commission_percent_override === null ? null : Number(a.commission_percent_override),
      email: maskEmail(a.email),
      clicks: Number(a.clicks),
      referrals: Number(a.referrals),
      pendingIdr: Number(a.pending),
      approvedIdr: Number(a.approved),
      paidIdr: Number(a.paid),
      createdAt: toIso(a.created_at)!,
    })),
    payouts: payouts.rows.map((y) => {
      const open = y.status === "requested" || y.status === "approved";
      const d = (y.destination ?? {}) as Record<string, string>;
      return {
        id: y.id as string,
        code: y.code as string,
        email: maskEmail(y.email),
        amountIdr: Number(y.amount_idr),
        method: y.method as "djiwa_pay" | "bank",
        // Full bank details only while the payout is open; history keeps the masked tail.
        destination:
          y.method === "bank"
            ? `${d["bankName"] ?? ""} · ${d["accountName"] ?? ""} · ${open ? (d["accountNumber"] ?? "") : maskAccountNumber(d["accountNumber"] ?? "")}`
            : "Saldo Djiwa Pay",
        status: y.status as string,
        reference: (y.reference as string | null) ?? null,
        note: (y.note as string | null) ?? null,
        reviewedBy: (y.reviewed_by as string | null) ?? null,
        flaggedReferrals: Number(y.flagged),
        createdAt: toIso(y.created_at)!,
      };
    }),
    flagged: flagged.rows.map((r) => ({
      id: r.id as string,
      code: r.code as string,
      email: maskEmail(r.email),
      reason: (r.flag_reason as string | null) ?? "Ditandai",
      lockedAt: toIso(r.locked_at)!,
    })),
    commissions: commissions.rows.map((c) => ({
      id: c.id as string,
      code: c.code as string,
      orderId: c.order_id as string,
      orderCode: c.public_order_code as string,
      amountIdr: Number(c.amount_idr),
      percent: Number(c.percent),
      status: c.status as string,
      reason: (c.reason as string | null) ?? null,
      inPayout: Boolean(c.payout_id),
      maturesAt: toIso(c.matures_at)!,
      createdAt: toIso(c.created_at)!,
    })),
  };
}

const reason = z.string().trim().min(4).max(500);
const adminActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("account.suspend"), accountId: z.string().uuid(), reason }),
  z.object({ action: z.literal("account.activate"), accountId: z.string().uuid(), reason }),
  z.object({
    action: z.literal("account.setPercent"),
    accountId: z.string().uuid(),
    percent: z.number().min(0).max(100).nullable(),
    reason,
  }),
  z.object({ action: z.literal("referral.unflag"), referralId: z.string().uuid(), reason }),
  z.object({ action: z.literal("commission.reverse"), commissionId: z.string().uuid(), reason }),
  z.object({ action: z.literal("payout.approve"), payoutId: z.string().uuid() }),
  z.object({ action: z.literal("payout.reject"), payoutId: z.string().uuid(), reason }),
  z.object({
    action: z.literal("payout.markPaid"),
    payoutId: z.string().uuid(),
    reference: z.string().trim().min(3).max(120),
  }),
]);
export const adminAffiliateActionInput = (data: unknown) => adminActionSchema.parse(data);

export async function mutateAdminAffiliateHandler({ data }: { data: unknown }) {
  const input = adminAffiliateActionInput(data);
  await requireAdmin();
  const actor = (await getAdminEmailHandler()) ?? "admin";
  const client = await pool.connect();
  let after: Record<string, unknown> = {};
  let entityType = "affiliate_account";
  let entityId = "";
  let why: string | null = null;
  let notifyJob: null | (() => Promise<void>) = null;
  try {
    await client.query("begin");
    switch (input.action) {
      case "account.suspend":
      case "account.activate": {
        const next = input.action === "account.suspend" ? "suspended" : "active";
        const r = await client.query(
          `update affiliate_accounts set status = $2, suspended_reason = $3, updated_at = now()
            where id = $1 and status <> $2 returning id`,
          [input.accountId, next, next === "suspended" ? input.reason : null],
        );
        if (!r.rows[0]) throw new Error("Akun tidak ditemukan atau status sudah sama");
        after = { status: next };
        entityId = input.accountId;
        why = input.reason;
        break;
      }
      case "account.setPercent": {
        const r = await client.query(
          `update affiliate_accounts set commission_percent_override = $2, updated_at = now()
            where id = $1 returning id`,
          [input.accountId, input.percent],
        );
        if (!r.rows[0]) throw new Error("Akun tidak ditemukan");
        after = { commissionPercentOverride: input.percent };
        entityId = input.accountId;
        why = input.reason;
        break;
      }
      case "referral.unflag": {
        const r = await client.query(
          `update affiliate_referrals set flagged = false, flag_reason = null
            where id = $1 and flagged returning id`,
          [input.referralId],
        );
        if (!r.rows[0]) throw new Error("Referral tidak ditemukan atau tidak ditandai");
        entityType = "affiliate_referral";
        entityId = input.referralId;
        after = { flagged: false };
        why = input.reason;
        break;
      }
      case "commission.reverse": {
        const r = await client.query(
          `update affiliate_commissions set status = 'reversed', reason = $2, updated_at = now()
            where id = $1 and status in ('pending','approved') returning id`,
          [input.commissionId, input.reason],
        );
        if (!r.rows[0])
          throw new Error("Komisi tidak bisa dibatalkan (sudah dicairkan atau dibatalkan)");
        await rebalanceOpenPayouts(client);
        entityType = "affiliate_commission";
        entityId = input.commissionId;
        after = { status: "reversed" };
        why = input.reason;
        break;
      }
      case "payout.approve":
      case "payout.reject":
      case "payout.markPaid": {
        const current = await client.query(
          `select y.id, y.status, a.customer_auth_subject as subject, y.amount_idr
             from affiliate_payouts y join affiliate_accounts a on a.id = y.affiliate_id
            where y.id = $1 for update of y`,
          [input.payoutId],
        );
        const payout = current.rows[0];
        if (!payout) throw new Error("Penarikan tidak ditemukan");
        entityType = "affiliate_payout";
        entityId = input.payoutId;
        const amount = Number(payout.amount_idr).toLocaleString("id-ID");
        if (input.action === "payout.approve") {
          if (payout.status !== "requested")
            throw new Error("Hanya penarikan berstatus Diajukan yang bisa disetujui");
          await client.query(
            "update affiliate_payouts set status = 'approved', reviewed_by = $2, reviewed_at = now(), updated_at = now() where id = $1",
            [input.payoutId, actor],
          );
          after = { status: "approved" };
        } else if (input.action === "payout.reject") {
          if (!["requested", "approved"].includes(payout.status))
            throw new Error("Penarikan sudah final");
          await client.query(
            "update affiliate_payouts set status = 'rejected', note = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now() where id = $1",
            [input.payoutId, input.reason, actor],
          );
          await client.query(
            "update affiliate_commissions set payout_id = null, updated_at = now() where payout_id = $1 and status = 'approved'",
            [input.payoutId],
          );
          after = { status: "rejected" };
          why = input.reason;
          notifyJob = () =>
            notify(
              payout.subject,
              `affiliate-payout-rejected:${input.payoutId}`,
              "Penarikan ditolak",
              `Penarikan Rp${amount} ditolak: ${input.reason}`,
            );
        } else {
          if (!["requested", "approved"].includes(payout.status))
            throw new Error("Penarikan sudah final");
          await client.query(
            "update affiliate_payouts set status = 'paid', reference = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now() where id = $1",
            [input.payoutId, input.reference, actor],
          );
          await client.query(
            "update affiliate_commissions set status = 'paid', updated_at = now() where payout_id = $1 and status = 'approved'",
            [input.payoutId],
          );
          after = { status: "paid", reference: input.reference };
          why = `ref ${input.reference}`;
          notifyJob = () =>
            notify(
              payout.subject,
              `affiliate-payout-paid:${input.payoutId}`,
              "Komisi dicairkan",
              `Penarikan Rp${amount} sudah dibayar.`,
            );
        }
        break;
      }
    }
    await recordAdminAction(
      { actor, action: `affiliate.${input.action}`, entityType, entityId, reason: why, after },
      client,
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  if (notifyJob) await notifyJob();
  return { ok: true as const };
}
