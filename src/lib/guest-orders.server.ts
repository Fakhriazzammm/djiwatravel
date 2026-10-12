import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { customerOrderItems, customerOrders, guestOrderAccess, esimProvisioningOrders, esimProfiles } from "../../drizzle/schema";
import { db } from "../db/client.server";
import { GUEST_ACCESS_TTL_MS, hashGuestAccessToken, normalizeGuestWhatsapp } from "./guest-order-access.server";
import { normalizeWhatsapp, WHATSAPP_PATTERN } from "./phone";
import { getResellerCatalog } from "./reseller-catalog-cache";
import { decryptEsimSecret } from "./esim-secret-crypto";
import { readMayarSnapshot } from "./payment-snapshot";
import { effectivePaymentStatus } from "./payment-expiry";
import { refreshTravelOrderProvisioning } from "./esim-provisioning-refresh.server";

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
  paymentMethod: z.enum(["qris", "va"]),
  idempotencyKey: z.string().uuid(),
  accessToken: z.string().min(32).max(256),
});

export const createGuestOrderDraft = createServerFn({ method: "POST" })
  .validator(createGuestOrderSchema)
  .handler(async ({ data }) => {
    const phone = normalizeGuestWhatsapp(data.whatsapp);
    const accessTokenHash = hashGuestAccessToken(data.accessToken);
    const previous = await db
      .select()
      .from(customerOrders)
      .where(eq(customerOrders.idempotencyKey, data.idempotencyKey))
      .limit(1);
    if (previous[0]) {
      const guest = await db
        .select({ accessTokenHash: guestOrderAccess.accessTokenHash, expiresAt: guestOrderAccess.expiresAt })
        .from(guestOrderAccess)
        .where(eq(guestOrderAccess.orderId, previous[0].id))
        .limit(1);
      if (guest[0]?.accessTokenHash !== accessTokenHash)
        throw new Error("Idempotency key already used");
      if (!guest[0]?.expiresAt || new Date(guest[0].expiresAt).getTime() <= Date.now())
        throw new Error("Guest access token expired");
      return {
        id: previous[0].id,
        publicOrderCode: previous[0].publicOrderCode,
        status: previous[0].status,
        amount: Number(previous[0].totalAmount),
        createdAtMs: new Date(previous[0].createdAt).getTime(),
        paymentExpiresAtMs: previous[0].paymentExpiresAt ? new Date(previous[0].paymentExpiresAt).getTime() : null,
        packageCode: data.packageCode,
        accessToken: data.accessToken,
      };
    }

    const catalog = await getResellerCatalog();
    const pkg = catalog.packages.find((item) => item.packageCode === data.packageCode);
    if (!pkg) throw new Error("Paket eSIM tidak ditemukan atau sudah tidak tersedia");
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
      durationDays: pkg.durationDays,
      speed: pkg.speed ?? null,
      supportsTopUp: pkg.supportsTopUp,
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
  });

const getGuestOrdersSchema = z
  .array(
    z.object({
      orderId: z.string().uuid(),
      accessToken: z.string().min(32).max(256),
    }),
  )
  .max(20);

export const getGuestOrders = createServerFn({ method: "POST" })
  .validator(getGuestOrdersSchema)
  .handler(async ({ data }) => {
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
          .leftJoin(esimProfiles, eq(esimProfiles.provisioningOrderId, esimProvisioningOrders.id))
          .where(
            and(
              eq(customerOrders.id, orderId),
              eq(guestOrderAccess.accessTokenHash, accessTokenHash),
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
        const activationCode = row.activationCodeEncrypted ? decryptEsimSecret(row.activationCodeEncrypted) : (qrPayload.split("$")[2] ?? "");
        const esim = row.installable === true && row.iccid && (qrPayload || activationCode) ? {
          iccid: row.iccid,
          smdp: qrPayload.startsWith("LPA:") ? (qrPayload.split("$")[1] ?? "") : "",
          activationCode,
          lpa: qrPayload,
        } : undefined;
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
          paymentMethod: row.paymentMethod === "va" ? "va" : "qris",
          paymentProvider: row.paymentProvider,
          paymentReference: row.paymentReference,
          ...(paymentUrl ? { paymentUrl } : {}),
          ...(row.providerOrderNo ? { providerOrderNo: row.providerOrderNo } : {}),
          ...(esim ? { esim } : {}),
          packageSnapshot: {
            name: typeof snapshot["name"] === "string" ? snapshot["name"] : row.packageCode,
            locationCodes: Array.isArray(snapshot["locationCodes"])
              ? snapshot["locationCodes"].filter(
                  (value): value is string => typeof value === "string",
                )
              : [],
            durationDays:
              typeof snapshot["durationDays"] === "number" ? snapshot["durationDays"] : 0,
            volumeBytes:
              typeof snapshot["volumeBytes"] === "number" ? snapshot["volumeBytes"] : null,
            supportsTopUp: snapshot["supportsTopUp"] === true,
          },
        };
      }),
    );
    return records.filter((record) => record !== null);
  });
