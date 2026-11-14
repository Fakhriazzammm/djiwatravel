import { createHash } from "node:crypto";
import { z } from "zod";
import { pool } from "../db/client.server";
import { requireAdmin } from "./admin-guard";
import { getAuthenticatedUser } from "./customer-session.fn";
import {
  CONSENT_PURPOSES,
  CONSENT_SNOOZE_DAYS,
  CONSENT_SOURCES,
  CONSENT_VERSION,
  EMPTY_CONSENT_STATE,
  computeNeedsPrompt,
  consentRequiredMessage,
  type ConsentPurpose,
  type ConsentState,
} from "./consent";

async function viewerId(): Promise<string | null> {
  try {
    const user = await getAuthenticatedUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/** The member's latest answer per purpose, plus the one-time prompt state. */
export async function readConsentState(subject: string): Promise<ConsentState> {
  const [latest, prompt] = await Promise.all([
    pool.query(
      `select distinct on (purpose) purpose, granted from customer_data_consents
        where customer_auth_subject = $1 order by purpose, created_at desc, id desc`,
      [subject],
    ),
    pool.query(
      "select answered_at, snoozed_until from customer_consent_prompts where customer_auth_subject = $1",
      [subject],
    ),
  ]);
  const purposes = { ...EMPTY_CONSENT_STATE.purposes };
  for (const row of latest.rows as { purpose: ConsentPurpose; granted: boolean }[])
    purposes[row.purpose] = row.granted;
  const p = prompt.rows[0] as { answered_at: Date | null; snoozed_until: Date | null } | undefined;
  const answered = Boolean(p?.answered_at);
  const snoozedUntil = p?.snoozed_until ? new Date(p.snoozed_until).toISOString() : null;
  return {
    purposes,
    answered,
    snoozedUntil,
    needsPrompt: computeNeedsPrompt(answered, snoozedUntil),
    version: CONSENT_VERSION,
  };
}

export async function hasConsent(subject: string, purpose: ConsentPurpose): Promise<boolean> {
  const result = await pool.query(
    `select granted from customer_data_consents
      where customer_auth_subject = $1 and purpose = $2 order by created_at desc, id desc limit 1`,
    [subject, purpose],
  );
  return result.rows[0]?.granted === true;
}

/** Throws a friendly message (where to turn the consent on) that the screens show as is. */
export async function assertConsent(subject: string, purpose: ConsentPurpose) {
  if (!(await hasConsent(subject, purpose))) throw new Error(consentRequiredMessage(purpose));
}

/** The same check for places that answer with a result object instead of throwing. */
export async function consentBlock(
  subject: string,
  purpose: ConsentPurpose,
): Promise<string | null> {
  return (await hasConsent(subject, purpose)) ? null : consentRequiredMessage(purpose);
}

export async function getMyConsentHandler(): Promise<ConsentState | null> {
  const id = await viewerId();
  return id ? readConsentState(id) : null;
}

const saveSchema = z.object({
  purposes: z
    .object({
      community: z.boolean().optional(),
      ai: z.boolean().optional(),
      personalization: z.boolean().optional(),
      promo: z.boolean().optional(),
    })
    .strict(),
  source: z.enum(CONSENT_SOURCES),
});
export const saveConsentInput = (data: unknown) => saveSchema.parse(data);

export async function saveMyConsentHandler({
  data,
}: {
  data: ReturnType<typeof saveConsentInput>;
}): Promise<ConsentState> {
  const id = await viewerId();
  if (!id) throw new Error("Masuk dulu untuk melanjutkan.");
  const before = await readConsentState(id);
  const changes = CONSENT_PURPOSES.filter(
    (purpose) =>
      data.purposes[purpose] !== undefined && data.purposes[purpose] !== before.purposes[purpose],
  );
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const purpose of changes) {
      await client.query(
        `insert into customer_data_consents (customer_auth_subject, purpose, granted, policy_version, source)
         values ($1, $2, $3, $4, $5)`,
        [id, purpose, data.purposes[purpose], CONSENT_VERSION, data.source],
      );
    }
    await client.query(
      `insert into customer_consent_prompts (customer_auth_subject, answered_at, snoozed_until, updated_at)
       values ($1, now(), null, now())
       on conflict (customer_auth_subject)
       do update set answered_at = coalesce(customer_consent_prompts.answered_at, now()),
                     snoozed_until = null, updated_at = now()`,
      [id],
    );
    // Withdrawing "community" takes the member's posts off the timeline; granting it again puts
    // back only the ones this withdrawal hid (never posts the team hid for other reasons).
    if (changes.includes("community")) {
      if (data.purposes.community === false)
        await client.query(
          `update feed_posts set status = 'HIDDEN', status_reason = 'consent_withdrawn', updated_at = now()
            where customer_auth_subject = $1 and status = 'PUBLISHED'`,
          [id],
        );
      else
        await client.query(
          `update feed_posts set status = 'PUBLISHED', status_reason = null, updated_at = now()
            where customer_auth_subject = $1 and status = 'HIDDEN' and status_reason = 'consent_withdrawn'`,
          [id],
        );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return readConsentState(id);
}

export async function snoozeConsentPromptHandler(): Promise<ConsentState> {
  const id = await viewerId();
  if (!id) throw new Error("Masuk dulu untuk melanjutkan.");
  await pool.query(
    `insert into customer_consent_prompts (customer_auth_subject, snoozed_until, updated_at)
     values ($1, now() + make_interval(days => $2), now())
     on conflict (customer_auth_subject)
     do update set snoozed_until = now() + make_interval(days => $2), updated_at = now()`,
    [id, CONSENT_SNOOZE_DAYS],
  );
  return readConsentState(id);
}

/* ------------------------------------------------------------------ Admin (read only) */

const ref = (subject: string) =>
  createHash("sha256").update(`consent:${subject}`).digest("hex").slice(0, 8);

/** Counts per purpose and the latest changes. Consent belongs to the member: Admin cannot edit it. */
export async function getAdminConsentHandler() {
  await requireAdmin();
  const [counts, prompts, recent] = await Promise.all([
    pool.query(
      `with latest as (
         select distinct on (customer_auth_subject, purpose) customer_auth_subject, purpose, granted
           from customer_data_consents order by customer_auth_subject, purpose, created_at desc, id desc)
       select purpose, count(*) filter (where granted)::int as granted,
              count(*) filter (where not granted)::int as withdrawn
         from latest group by purpose`,
    ),
    pool.query(
      `select count(*) filter (where answered_at is not null)::int as answered,
              count(*) filter (where answered_at is null and snoozed_until > now())::int as snoozed,
              count(*)::int as total
         from customer_consent_prompts`,
    ),
    pool.query(
      `select customer_auth_subject, purpose, granted, source, policy_version, created_at
         from customer_data_consents order by created_at desc, id desc limit 50`,
    ),
  ]);
  const byPurpose = new Map(
    (counts.rows as { purpose: ConsentPurpose; granted: number; withdrawn: number }[]).map((r) => [
      r.purpose,
      r,
    ]),
  );
  const p = (prompts.rows[0] ?? { answered: 0, snoozed: 0, total: 0 }) as {
    answered: number;
    snoozed: number;
    total: number;
  };
  return {
    version: CONSENT_VERSION,
    purposes: CONSENT_PURPOSES.map((purpose) => ({
      purpose,
      granted: Number(byPurpose.get(purpose)?.granted ?? 0),
      withdrawn: Number(byPurpose.get(purpose)?.withdrawn ?? 0),
    })),
    prompts: { answered: Number(p.answered), snoozed: Number(p.snoozed), total: Number(p.total) },
    recent: (
      recent.rows as {
        customer_auth_subject: string;
        purpose: ConsentPurpose;
        granted: boolean;
        source: string;
        policy_version: string;
        created_at: Date;
      }[]
    ).map((r) => ({
      ref: ref(r.customer_auth_subject),
      purpose: r.purpose,
      granted: r.granted,
      source: r.source,
      version: r.policy_version,
      at: new Date(r.created_at).toISOString(),
    })),
  };
}
