import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { customerOrders, guestOrderAccess, guestOrderRecoveryTokens } from "../../drizzle/schema";
import { db } from "../db/client.server";
import { normalizeGuestWhatsapp } from "./guest-order-access.server";
import { normalizeWhatsapp, WHATSAPP_PATTERN } from "./phone";

const RECOVERY_TTL_MS = 15 * 60 * 1000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attemptsByContact = new Map<string, { count: number; expiresAt: number }>();

const recoverySchema = z.object({
  publicOrderCode: z.string().trim().min(6).max(80),
  email: z.string().trim().email().max(254),
  whatsapp: z
    .string()
    .trim()
    .min(9)
    .max(32)
    .transform(normalizeWhatsapp)
    .refine((value) => WHATSAPP_PATTERN.test(value)),
});

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function neutralError(): never {
  const error = new Error("Data pesanan belum dapat diverifikasi. Periksa kode dan kontakmu.");
  Object.assign(error, { status: 400 });
  throw error;
}

export async function recoverGuestOrder(input: unknown) {
  const data = recoverySchema.parse(input);
  const contactKey = hash(`${data.email.toLowerCase()}|${data.whatsapp}`);
  const now = Date.now();
  const current = attemptsByContact.get(contactKey);
  if (current && current.expiresAt > now && current.count >= MAX_ATTEMPTS) {
    const error = new Error("Terlalu banyak percobaan. Coba lagi beberapa menit lagi.");
    Object.assign(error, { status: 429 });
    throw error;
  }
  attemptsByContact.set(contactKey, {
    count: current && current.expiresAt > now ? current.count + 1 : 1,
    expiresAt: now + WINDOW_MS,
  });

  const rows = await db
    .select({
      orderId: customerOrders.id,
      accessEmail: guestOrderAccess.email,
      accessWhatsapp: guestOrderAccess.whatsapp,
    })
    .from(customerOrders)
    .innerJoin(guestOrderAccess, eq(guestOrderAccess.orderId, customerOrders.id))
    .where(
      and(
        eq(customerOrders.publicOrderCode, data.publicOrderCode),
        gt(guestOrderAccess.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (
    !row ||
    row.accessEmail.toLowerCase() !== data.email.toLowerCase() ||
    normalizeGuestWhatsapp(row.accessWhatsapp) !== data.whatsapp
  )
    neutralError();

  const token = randomBytes(32).toString("hex");
  await db.insert(guestOrderRecoveryTokens).values({
    orderId: row.orderId,
    tokenHash: hash(token),
    expiresAt: new Date(now + RECOVERY_TTL_MS).toISOString(),
  });
  return { orderId: row.orderId, accessToken: token, expiresAt: now + RECOVERY_TTL_MS };
}

export async function consumeGuestRecoveryToken(orderId: string, token: string) {
  if (!z.string().uuid().safeParse(orderId).success || !/^[a-f0-9]{64}$/.test(token))
    neutralError();
  const rows = await db
    .select({ id: guestOrderRecoveryTokens.id })
    .from(guestOrderRecoveryTokens)
    .where(
      and(
        eq(guestOrderRecoveryTokens.orderId, orderId),
        eq(guestOrderRecoveryTokens.tokenHash, hash(token)),
        gt(guestOrderRecoveryTokens.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1);
  if (!rows[0]) neutralError();
  await db
    .update(guestOrderRecoveryTokens)
    .set({ consumedAt: new Date().toISOString() })
    .where(eq(guestOrderRecoveryTokens.id, rows[0].id));
  return { orderId };
}
