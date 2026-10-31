import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  customerOrderItems,
  customerOrderPaymentDetails,
  customerOrders,
} from "../../drizzle/schema";
import { db } from "../db/client.server";
import { getAuthenticatedUser } from "./customer-session.fn";
import { readCustomerProfile } from "./customer-profile.server";
import {
  CUSTOMER_PROFILE_GENDERS,
  isCustomerProfileComplete,
  type CustomerProfileGender,
} from "./customer-profile";
import { loadLiveResellerPackage } from "./esim-access-catalog";
import { getResellerCatalog } from "./reseller-catalog-cache";
import { assertPackageSellableForOrder } from "./sellability.server";

export const AUTH_PAYMENT_METHODS = ["qris", "djiwa_pay"] as const;

export const createAuthenticatedOrderSchema = z.object({
  packageCode: z.string().trim().min(1).max(160),
  paymentMethod: z.enum(AUTH_PAYMENT_METHODS),
  idempotencyKey: z.string().uuid(),
});

export type CreateAuthenticatedOrderInput = z.infer<typeof createAuthenticatedOrderSchema>;

export const createAuthenticatedOrderInput = (data: unknown) =>
  createAuthenticatedOrderSchema.parse(data);

const orderSummaryColumns = {
  id: customerOrders.id,
  publicOrderCode: customerOrders.publicOrderCode,
  status: customerOrders.status,
  totalAmount: customerOrders.totalAmount,
  customerAuthSubject: customerOrders.customerAuthSubject,
  createdAt: customerOrders.createdAt,
  paymentExpiresAt: customerOrders.paymentExpiresAt,
};

/** Shape the checkout page consumes; no owner id or contact is returned to the browser. */
function toClientOrder(
  row: {
    id: string;
    publicOrderCode: string;
    status: string;
    totalAmount: string;
    createdAt: string;
    paymentExpiresAt: string | null;
  },
  packageCode: string,
) {
  return {
    id: row.id,
    publicOrderCode: row.publicOrderCode,
    status: row.status,
    packageCode,
    amount: Number(row.totalAmount),
    createdAtMs: Date.parse(row.createdAt),
    paymentExpiresAtMs: row.paymentExpiresAt ? Date.parse(row.paymentExpiresAt) : null,
  };
}

/**
 * Create a new order from a verified Better Auth session.
 *
 * No email, WhatsApp, or owner id is accepted from the browser: the session
 * provides the identity and the profile table provides the contact details.
 * A duplicate idempotency key returns the existing order only for the same
 * subject; a key reused by another subject is refused.
 */
export async function createAuthenticatedOrderDraftHandler({
  data,
}: {
  data: CreateAuthenticatedOrderInput;
}) {
  const user = await getAuthenticatedUser();

  const stored = await readCustomerProfile(user);
  const gender = (CUSTOMER_PROFILE_GENDERS as readonly string[]).includes(stored?.gender ?? "")
    ? (stored?.gender as CustomerProfileGender)
    : null;
  const profile = stored && { ...stored, gender };
  if (!profile || !isCustomerProfileComplete(profile)) {
    throw new Error("Profil belum lengkap. Isi email dan WhatsApp di Profil sebelum checkout.");
  }

  const [existing] = await db
    .select(orderSummaryColumns)
    .from(customerOrders)
    .where(eq(customerOrders.idempotencyKey, data.idempotencyKey))
    .limit(1);
  if (existing) {
    if (existing.customerAuthSubject !== user.id) {
      throw new Error("Idempotency key ini sudah digunakan akun lain.");
    }
    return toClientOrder(existing, data.packageCode);
  }

  // Always price against the live provider catalogue; the cached catalogue is only a fallback.
  const live = await loadLiveResellerPackage(data.packageCode).catch(() => null);
  const catalog = await getResellerCatalog();
  const pkg = live ?? catalog.packages.find((item) => item.packageCode === data.packageCode);
  if (!pkg) throw new Error("Paket eSIM tidak ditemukan atau sudah tidak tersedia");
  await assertPackageSellableForOrder(pkg);

  const price = pkg.sellingPrice;
  const id = randomUUID();
  const publicOrderCode = randomBytes(12).toString("hex").toUpperCase();

  await db.transaction(async (tx) => {
    await tx.insert(customerOrders).values({
      id,
      publicOrderCode,
      status: "ORDER_CREATED",
      currencyCode: "IDR",
      subtotalAmount: String(price.providerCostIdr),
      markupAmount: String(price.markupIdr),
      totalAmount: String(price.sellingPriceIdr),
      idempotencyKey: data.idempotencyKey,
      // Ownership is set at creation and never left null.
      customerAuthSubject: user.id,
      customerAuthLinkedAt: new Date().toISOString(),
    });
    await tx.insert(customerOrderItems).values({
      orderId: id,
      providerPackageCode: pkg.packageCode,
      quantity: 1,
      providerUnitCost: String(price.providerCostIdr),
      markupUnitAmount: String(price.markupIdr),
      sellingUnitPrice: String(price.sellingPriceIdr),
      lineTotal: String(price.sellingPriceIdr),
      packageNameSnapshot: pkg.name,
      packageSnapshot: {
        packageCode: pkg.packageCode,
        name: pkg.name,
        locationCodes: pkg.locationCodes,
        volumeBytes: pkg.volumeBytes,
        ...(pkg.unlimited === true ? { unlimited: true } : {}),
        durationDays: pkg.durationDays,
        speed: pkg.speed ?? null,
        supportsTopUp: pkg.supportsTopUp,
        providerPriceUnits: pkg.providerPriceUnits,
      },
    });
    await tx.insert(customerOrderPaymentDetails).values({
      orderId: id,
      email: profile.email,
      whatsapp: profile.whatsapp,
      paymentMethod: data.paymentMethod,
    });
  });

  const [row] = await db
    .select(orderSummaryColumns)
    .from(customerOrders)
    .where(eq(customerOrders.id, id))
    .limit(1);
  if (!row) throw new Error("Pesanan gagal disimpan. Coba lagi.");
  return toClientOrder(row, data.packageCode);
}
