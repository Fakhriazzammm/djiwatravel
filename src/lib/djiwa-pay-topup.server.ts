import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireBetterAuthUser, resolveCanonicalCustomerSourceId as fetchCanonicalCustomerSourceId } from "./customer-profile.server";

const topupInputSchema = z.object({
  amount: z.number().finite(),
  idempotencyKey: z.string().trim().min(16).max(128),
});

const canonicalResponseSchema = z.object({
  success: z.boolean().optional(),
  topup_id: z.string().min(1),
  invoice_id: z.string().min(1),
  invoice_url: z.string().url(),
  status: z.literal("pending"),
});

export type DjiwaPayTopup = z.infer<typeof canonicalResponseSchema>;

/** The browser amount is never sent until this server-side check succeeds. */
export function validateTopupAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 1000) {
    throw new Error("Nominal top up minimal Rp1.000 dan harus berupa rupiah bulat");
  }
  return amount;
}

export function parseCanonicalTopupResponse(raw: unknown): DjiwaPayTopup {
  const parsed = canonicalResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Respons invoice Djiwa Pay tidak valid");
  return parsed.data;
}

function canonicalWalletUrl() {
  const value = process.env["DJIWA_PAY_CUSTOMER_WALLET_URL"]?.trim();
  if (!value) throw new Error("Top up Djiwa Pay belum dikonfigurasi untuk Djiwa Travel");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Endpoint Djiwa Pay harus menggunakan HTTPS");
  return url.toString();
}

function publicOrigin() {
  const origin = process.env["DJIWA_TRAVEL_PUBLIC_ORIGIN"]?.trim() || "https://djiwatravel.com";
  const url = new URL(origin);
  if (url.protocol !== "https:") throw new Error("Origin Djiwa Travel harus menggunakan HTTPS");
  return url.origin;
}

export class CanonicalIdentityConfigurationError extends Error {
  constructor() {
    super("Top up Djiwa Pay belum memiliki pemetaan identitas customer yang terverifikasi");
    this.name = "CanonicalIdentityConfigurationError";
  }
}

export async function resolveVerifiedCanonicalCustomerSourceId(user: { email: string }) {
  try {
    return await fetchCanonicalCustomerSourceId(user.email);
  } catch {
    throw new CanonicalIdentityConfigurationError();
  }
}

export function canonicalTopupPayload(input: { amount: number; idempotencyKey: string; canonicalCustomerSourceId: string; email: string }) {
  return {
    action: "topup",
    amount: validateTopupAmount(input.amount),
    idempotencyKey: input.idempotencyKey,
    // The canonical source id was resolved and ownership-validated server-side.
    sourceId: input.canonicalCustomerSourceId,
    email: input.email,
    origin: publicOrigin(),
  } as const;
}

export const createDjiwaPayTopup = createServerFn({ method: "POST" })
  .validator(topupInputSchema)
  .handler(async ({ data }) => {
    const user = await requireBetterAuthUser();
    const canonicalCustomerSourceId = await resolveVerifiedCanonicalCustomerSourceId(user);
    const payload = canonicalTopupPayload({
      amount: data.amount,
      idempotencyKey: data.idempotencyKey,
      canonicalCustomerSourceId,
      email: user.email,
    });

    const response = await fetch(canonicalWalletUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const raw = await response.json().catch(() => null);
    if (!response.ok) {
      const message = raw && typeof raw === "object" && "error" in raw && typeof raw.error === "string"
        ? raw.error
        : "Top up belum dapat dibuat. Coba lagi.";
      throw new Error(message);
    }
    return parseCanonicalTopupResponse(raw);
  });

export const djiwaPayTopupContract = {
  auth: "Better Auth session is required; sourceId and email are never accepted from the browser",
  canonicalIdentity: "A verified per-user server-side mapping is required; Better Auth user.id is never used as sourceId",
  canonicalIdentityContract: "DJIWA_PAY_CUSTOMER_SOURCE_ID names a resolved mapping contract only, never a shared env value or browser input",
  canonicalEndpoint: "DJIWA_PAY_CUSTOMER_WALLET_URL (HTTPS only), server-side only",
  canonicalAction: "POST { action: topup, sourceId, email, amount, idempotencyKey, origin }",
  settlement: "pending until the canonical Mayar webhook settles customer_wallet_topups",
} as const;
