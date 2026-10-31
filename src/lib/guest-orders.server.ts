import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  customerOrderItems,
  customerOrders,
  guestOrderAccess,
  guestOrderRecoveryTokens,
  esimProvisioningOrders,
  esimProfiles,
} from "../../drizzle/schema";
import { db } from "../db/client.server";
import {
  GUEST_ACCESS_TTL_MS,
  hashGuestAccessToken,
  normalizeGuestWhatsapp,
} from "./guest-order-access.server";
import { normalizeWhatsapp, WHATSAPP_PATTERN } from "./phone";
import { getResellerCatalog } from "./reseller-catalog-cache";
import { loadLiveResellerPackage } from "./esim-access-catalog";
import { assertPackageSellableForOrder } from "./sellability.server";
import { decryptEsimSecret } from "./esim-secret-crypto";
import { readMayarSnapshot } from "./payment-snapshot";
import { effectivePaymentStatus } from "./payment-expiry";
import { refreshTravelOrderProvisioning } from "./esim-provisioning-refresh.server";
import { readStoredUsageForOrders } from "./esim-stored-usage.server";
import {
  isCustomerProfileComplete,
} from "./customer-profile";
import { readCustomerProfile, requireBetterAuthUser } from "./customer-profile.server";
import { newCheckoutPaymentMethodSchema, storedPaymentMethod } from "./travel-payment-method";

async function requireCompleteWalletCustomer() {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const user = await requireBetterAuthUser(getRequestHeader("cookie") ?? "");
  const profile = await readCustomerProfile(user);
  if (
    !profile ||
    profile.email.toLowerCase() !== user.email.toLowerCase() ||
    !isCustomerProfileComplete({ email: profile.email, whatsapp: profile.whatsapp })
  ) {
    throw new Error("Lengkapi profil member sebelum membayar dengan saldo Djiwa Pay");
  }
  return user;
}

const createGuestOrderSchema = z.object({
  packageCode: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(254),
  whatsapp: z
    .string()
    .trim()
    .min(9)
    .max(32)
    .transform((value) => normalizeWhatsapp(value))
    .refine((value) => WHATSAPP_PATTERN.test(value), {
      message: "Nomor WhatsApp belum valid. Contoh: 08123456789.",
    }),
  paymentMethod: newCheckoutPaymentMethodSchema,
  idempotencyKey: z.string().uuid(),
  accessToken: z.string().min(32).max(256),
});

export const createGuestOrderDraftInput = (data: z.input<typeof createGuestOrderSchema>) =>
  createGuestOrderSchema.parse(data);
export const createGuestOrderDraftHandler = async ({
  data,
}: {
  data: ReturnType<typeof createGuestOrderDraftInput>;
}) => {
  const walletCustomer = data.paymentMethod === "djiwa_pay"
    ? await requireCompleteWalletCustomer()
    : null;
  const phone = normalizeGuestWhatsapp(data.whatsapp);
  const accessTokenHash = hashGuestAccessToken(data.accessToken);
  const previous = await db
    .select()
    .from(customerOrders)
    .where(eq(customerOrders.idempotencyKey, data.idempotencyKey))
    .limit(1);
  if (previous[0]) {
    const guest = await db
      .select({
        accessTokenHash: guestOrderAccess.accessTokenHash,
        expiresAt: guestOrderAccess.expiresAt,
        paymentMethod: guestOrderAccess.paymentMethod,
      })
      .from(guestOrderAccess)
      .where(eq(guestOrderAccess.orderId, previous[0].id))
      .limit(1);
    if (guest[0]?.accessTokenHash !== accessTokenHash)
      throw new Error("Idempotency key already used");
    if (guest[0]?.paymentMethod !== data.paymentMethod)
      throw new Error("Idempotency key already used for another payment method");
    if (data.paymentMethod === "djiwa_pay" && previous[0].customerAuthSubject !== walletCustomer?.id)
      throw new Error("Pesanan wallet tidak dimiliki oleh member ini");
    if (!guest[0]?.expiresAt || new Date(guest[0].expiresAt).getTime() <= Date.now())
      throw new Error("Guest access token expired");
    return {
      id: previous[0].id,
      publicOrderCode: previous[0].publicOrderCode,
      status: previous[0].status,
      amount: Number(previous[0].totalAmount),
      createdAtMs: new Date(previous[0].createdAt).getTime(),
      paymentExpiresAtMs: previous[0].paymentExpiresAt
        ? new Date(previous[0].paymentExpiresAt).getTime()
        : null,
      packageCode: data.packageCode,
      accessToken: data.accessToken,
    };
  }

  const catalog = await getResellerCatalog();
  // Always order against the provider's current price: a cached price can be stale by the time we
  // invoice, and the provider refuses an order whose price no longer matches its catalogue. The
  // cached catalogue stays as a fallback so a provider hiccup cannot block a visible package.
  const live = await loadLiveResellerPackage(data.packageCode).catch(() => null);
  const pkg = live ?? catalog.packages.find((item) => item.packageCode === data.packageCode);
  if (!pkg) throw new Error("Paket eSIM tidak ditemukan atau sudah tidak tersedia");
  // Authoritative gate: the catalogue badge can be seconds stale, so re-check the balance here,
  // before an order row or an invoice exists.
  await assertPackageSellableForOrder(pkg);
  const price = pkg.sellingPrice;
  const id = randomUUID();
  const publicOrderCode = randomBytes(12).toString("hex").toUpperCase();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + GUEST_ACCESS_TTL_MS);
  const packageSnapshot = {
    packageCode: pkg.packageCode,
    name: pkg.name,
    locationCodes: pkg.locationCodes,
    volumeBytes: pkg.volumeBytes,
    ...(pkg.unlimited === true ? { unlimited: true } : {}),
    durationDays: pkg.durationDays,
    speed: pkg.speed ?? null,
    supportsTopUp: pkg.supportsTopUp,
    // Stored so provisioning can always tell the provider price apart from the IDR cost.
    providerPriceUnits: pkg.providerPriceUnits,
  };

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
      ...(walletCustomer
        ? {
            customerAuthSubject: walletCustomer.id,
            customerAuthLinkedAt: now.toISOString(),
          }
        : {}),
      priceSnapshot: {
        ...price.configSnapshot,
        capturedAt: now.toISOString(),
        providerPriceUnits: pkg.providerPriceUnits,
        package: packageSnapshot,
      },
      expiresAt: null,
      paymentExpiresAt: expiresAt.toISOString(),
    });
    await tx.insert(customerOrderItems).values({
      orderId: id,
      providerPackageCode: pkg.packageCode,
      packageNameSnapshot: pkg.name,
      quantity: 1,
      providerUnitCost: String(price.providerCostIdr),
      markupUnitAmount: String(price.markupIdr),
      sellingUnitPrice: String(price.sellingPriceIdr),
      lineTotal: String(price.sellingPriceIdr),
      packageSnapshot,
    });
    await tx.insert(guestOrderAccess).values({
      orderId: id,
      accessTokenHash,
      email: data.email.toLowerCase(),
      whatsapp: phone,
      paymentMethod: data.paymentMethod,
      expiresAt: expiresAt.toISOString(),
    });
  });

  return {
    id,
    publicOrderCode,
    status: "ORDER_CREATED",
    amount: price.sellingPriceIdr,
    createdAtMs: now.getTime(),
    paymentExpiresAtMs: expiresAt.getTime(),
    packageCode: pkg.packageCode,
    accessToken: data.accessToken,
  };
};

export const createGuestOrderDraft = createServerFn({ method: "POST" })
  .validator(createGuestOrderSchema)
  .handler(createGuestOrderDraftHandler);

const getGuestOrdersSchema = z
  .array(
    z.object({
      orderId: z.string().uuid(),
      accessToken: z.string().min(32).max(256),
    }),
  )
  .max(20);

export const getGuestOrdersInput = (data: z.input<typeof getGuestOrdersSchema>) =>
  getGuestOrdersSchema.parse(data);
export const getGuestOrdersHandler = async ({
  data,
}: {
  data: ReturnType<typeof getGuestOrdersInput>;
}) => {
  const records = await Promise.all(
    data.map(async ({ orderId, accessToken }) => {
      // The provider webhook is not registered on this deployment, so pull the issued eSIM profile
      // here: opening the order page is what turns PROVISIONING into READY for the customer.
      await refreshTravelOrderProvisioning(orderId).catch(() => undefined);
      const accessTokenHash = hashGuestAccessToken(accessToken);
      const rows = await db
        .select({
          id: customerOrders.id,
          publicOrderCode: customerOrders.publicOrderCode,
          status: customerOrders.status,
          amount: customerOrders.totalAmount,
          createdAt: customerOrders.createdAt,
          expiresAt: customerOrders.esimActivationExpiresAt,
          paymentExpiresAt: customerOrders.paymentExpiresAt,
          activationProfileExpiresAt: esimProfiles.expiresAt,
          packageCode: customerOrderItems.providerPackageCode,
          paymentProvider: customerOrders.paymentProvider,
          paymentReference: customerOrders.paymentReference,
          paymentMethod: guestOrderAccess.paymentMethod,
          guestAccessExpiresAt: guestOrderAccess.expiresAt,
          packageSnapshot: customerOrderItems.packageSnapshot,
          priceSnapshot: customerOrders.priceSnapshot,
          providerOrderNo: esimProvisioningOrders.providerOrderNo,
          providerStatus: esimProvisioningOrders.status,
          iccid: esimProfiles.iccid,
          profileStatus: esimProfiles.profileStatus,
          qrPayloadEncrypted: esimProfiles.qrPayloadEncrypted,
          activationCodeEncrypted: esimProfiles.activationCodeEncrypted,
          installable: esimProfiles.installable,
        })
        .from(customerOrders)
        .innerJoin(guestOrderAccess, eq(guestOrderAccess.orderId, customerOrders.id))
        .innerJoin(customerOrderItems, eq(customerOrderItems.orderId, customerOrders.id))
        .leftJoin(esimProvisioningOrders, eq(esimProvisioningOrders.orderId, customerOrders.id))
        .leftJoin(guestOrderRecoveryTokens, eq(guestOrderRecoveryTokens.orderId, customerOrders.id))
        .leftJoin(esimProfiles, eq(esimProfiles.provisioningOrderId, esimProvisioningOrders.id))
        .where(
          and(
            eq(customerOrders.id, orderId),
            or(
              eq(guestOrderAccess.accessTokenHash, accessTokenHash),
              and(
                eq(guestOrderRecoveryTokens.tokenHash, accessTokenHash),
                gt(guestOrderRecoveryTokens.expiresAt, new Date().toISOString()),
                isNull(guestOrderRecoveryTokens.consumedAt),
              ),
            ),
            gt(guestOrderAccess.expiresAt, new Date().toISOString()),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const snapshot = (row.packageSnapshot ?? {}) as Record<string, unknown>;
      // The invoice step stores the Mayar reference nested under `mayar`, so a
      // returning customer still gets their payment link after a reload.
      const paymentUrl = readMayarSnapshot(row.priceSnapshot).paymentUrl;
      const qrPayload = row.qrPayloadEncrypted ? decryptEsimSecret(row.qrPayloadEncrypted) : "";
      const activationCode = row.activationCodeEncrypted
        ? decryptEsimSecret(row.activationCodeEncrypted)
        : (qrPayload.split("$")[2] ?? "");
      const esim =
        row.installable === true && row.iccid && (qrPayload || activationCode)
          ? {
              iccid: row.iccid,
              smdp: qrPayload.startsWith("LPA:") ? (qrPayload.split("$")[1] ?? "") : "",
              activationCode,
              lpa: qrPayload,
            }
          : undefined;
      return {
        id: row.id,
        publicOrderCode: row.publicOrderCode,
        status: effectivePaymentStatus(row.status, row.paymentExpiresAt),
        amount: Number(row.amount),
        createdAtMs: new Date(row.createdAt).getTime(),
        expiresAtMs: row.activationProfileExpiresAt
          ? new Date(row.activationProfileExpiresAt).getTime()
          : row.expiresAt
            ? new Date(row.expiresAt).getTime()
            : null,
        paymentExpiresAtMs: row.paymentExpiresAt ? new Date(row.paymentExpiresAt).getTime() : null,
        packageCode: row.packageCode,
        paymentMethod: storedPaymentMethod(row.paymentMethod),
        paymentProvider: row.paymentProvider,
        paymentReference: row.paymentReference,
        ...(paymentUrl ? { paymentUrl } : {}),
        ...(row.providerOrderNo ? { providerOrderNo: row.providerOrderNo } : {}),
        ...(row.profileStatus ? { profileStatus: row.profileStatus } : {}),
        ...(esim ? { esim } : {}),
        packageSnapshot: {
          name: typeof snapshot["name"] === "string" ? snapshot["name"] : row.packageCode,
          locationCodes: Array.isArray(snapshot["locationCodes"])
            ? snapshot["locationCodes"].filter(
                (value): value is string => typeof value === "string",
              )
            : [],
          durationDays: typeof snapshot["durationDays"] === "number" ? snapshot["durationDays"] : 0,
          volumeBytes: typeof snapshot["volumeBytes"] === "number" ? snapshot["volumeBytes"] : null,
          ...(snapshot["unlimited"] === true ? { unlimited: true } : {}),
          supportsTopUp: snapshot["supportsTopUp"] === true,
        },
      };
    }),
  );
  const authorizedRecords = records.filter((record) => record !== null);
  // Only records that passed the guest-token predicate may supply provider order numbers here.
  const usageByOrder = await readStoredUsageForOrders(
    authorizedRecords.map((record) => record.providerOrderNo),
  ).catch(() => new Map());
  return authorizedRecords.map((record) => {
    const usage = record.providerOrderNo ? usageByOrder.get(record.providerOrderNo) : undefined;
    return usage ? { ...record, usage } : record;
  });
};

export const getGuestOrders = createServerFn({ method: "POST" })
  .validator(getGuestOrdersSchema)
  .handler(getGuestOrdersHandler);
