import { and, eq, isNull } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  customerOrderItems,
  customerOrders,
  esimProfiles,
  esimProvisioningOrders,
  guestOrderAccess,
  orderClaimEvents,
} from "../../drizzle/schema";
import { db } from "../db/client.server";
import { getAuthenticatedUser } from "./customer-session.fn";
import { decryptEsimSecret } from "./esim-secret-crypto";
import { effectivePaymentStatus } from "./payment-expiry";
import { readMayarSnapshot } from "./payment-snapshot";
import { refreshTravelOrderProvisioning } from "./esim-provisioning-refresh.server";
import { hashGuestAccessToken } from "./guest-order-access.server";
import { claimGuestOrder, type ClaimDecision } from "./travel-order-identity";
import type { GuestOrderRecord } from "./guest-order-view";
import { readStoredUsageForOrders } from "./esim-stored-usage.server";

/**
 * Exact ownership predicate used by the member read path.
 *
 * The subject comes from the verified Better Auth session, so an id guessed by a browser can never
 * satisfy it. Deliberately not exported as a general "does this look like mine" helper: every
 * caller must pass a subject it obtained server-side.
 */
export function memberOrderBelongsToUser(
  order: { customerAuthSubject: string | null },
  authSubject: string,
) {
  const subject = (authSubject ?? "").trim();
  return Boolean(subject) && order.customerAuthSubject === subject;
}

/** The selected columns for one order, shared by the first read and the post-refresh read. */
const memberOrderSelection = {
  id: customerOrders.id,
  customerAuthSubject: customerOrders.customerAuthSubject,
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
  packageSnapshot: customerOrderItems.packageSnapshot,
  priceSnapshot: customerOrders.priceSnapshot,
  providerOrderNo: esimProvisioningOrders.providerOrderNo,
  iccid: esimProfiles.iccid,
  qrPayloadEncrypted: esimProfiles.qrPayloadEncrypted,
  activationCodeEncrypted: esimProfiles.activationCodeEncrypted,
  installable: esimProfiles.installable,
  profileStatus: esimProfiles.profileStatus,
} as const;

function memberOrderRows(authSubject: string) {
  return db
    .select(memberOrderSelection)
    .from(customerOrders)
    .innerJoin(customerOrderItems, eq(customerOrderItems.orderId, customerOrders.id))
    .leftJoin(guestOrderAccess, eq(guestOrderAccess.orderId, customerOrders.id))
    .leftJoin(esimProvisioningOrders, eq(esimProvisioningOrders.orderId, customerOrders.id))
    .leftJoin(esimProfiles, eq(esimProfiles.provisioningOrderId, esimProvisioningOrders.id))
    .where(eq(customerOrders.customerAuthSubject, authSubject))
    .orderBy(customerOrders.createdAt);
}

function toGuestOrderRecord(
  row: Awaited<ReturnType<typeof memberOrderRows>>[number],
): GuestOrderRecord {
  const snapshot = (row.packageSnapshot ?? {}) as Record<string, unknown>;
  const paymentUrl = readMayarSnapshot(row.priceSnapshot).paymentUrl;
  const qrPayload = row.qrPayloadEncrypted ? decryptEsimSecret(row.qrPayloadEncrypted) : "";
  const activationCode = row.activationCodeEncrypted
    ? decryptEsimSecret(row.activationCodeEncrypted)
    : (qrPayload.split("$")[2] ?? "");
  return {
    id: row.id,
    publicOrderCode: row.publicOrderCode,
    status: effectivePaymentStatus(row.status, row.paymentExpiresAt),
    amount: Number(row.amount),
    createdAtMs: new Date(row.createdAt).getTime(),
    // Activation validity is separate from the payment window: a delayed provisioning run must not
    // shorten how long the eSIM stays valid.
    expiresAtMs: row.activationProfileExpiresAt
      ? new Date(row.activationProfileExpiresAt).getTime()
      : row.expiresAt
        ? new Date(row.expiresAt).getTime()
        : null,
    paymentExpiresAtMs: row.paymentExpiresAt ? new Date(row.paymentExpiresAt).getTime() : null,
    packageCode: row.packageCode,
    paymentMethod: row.paymentMethod ?? "qris",
    paymentProvider: row.paymentProvider,
    paymentReference: row.paymentReference,
    ...(paymentUrl ? { paymentUrl } : {}),
    ...(row.providerOrderNo ? { providerOrderNo: row.providerOrderNo } : {}),
    ...(row.profileStatus ? { profileStatus: row.profileStatus } : {}),
    // eSIM secrets are only decrypted for rows the member read path already proved belong to the
    // caller, and only once the profile is installable.
    ...(row.installable && row.iccid && (qrPayload || activationCode)
      ? {
          esim: {
            iccid: row.iccid,
            smdp: qrPayload.startsWith("LPA:") ? (qrPayload.split("$")[1] ?? "") : "",
            activationCode,
            lpa: qrPayload,
          },
        }
      : {}),
    packageSnapshot: {
      // `noPropertyAccessFromIndexSignature` is on, and the snapshot is a JSON column, so every read
      // goes through a bracket access after an explicit type check.
      name: typeof snapshot["name"] === "string" ? snapshot["name"] : row.packageCode,
      locationCodes: Array.isArray(snapshot["locationCodes"])
        ? snapshot["locationCodes"].filter((v): v is string => typeof v === "string")
        : [],
      durationDays: typeof snapshot["durationDays"] === "number" ? snapshot["durationDays"] : 0,
      volumeBytes: typeof snapshot["volumeBytes"] === "number" ? snapshot["volumeBytes"] : null,
      ...(snapshot["unlimited"] === true ? { unlimited: true } : {}),
      supportsTopUp: snapshot["supportsTopUp"] === true,
    },
  };
}

/**
 * Every order owned by the verified session, from any device.
 *
 * Ownership is resolved from the session cookie on the server; no browser-supplied user id, email,
 * or phone number participates. Provisioning is refreshed for settled orders before the read is
 * returned, so a customer who returns later sees the current state instead of a frozen one.
 */
export const getMemberOrdersHandler = async () => {
  const user = await getAuthenticatedUser();
  const rows = await memberOrderRows(user.id);

  await Promise.all(
    rows
      .filter((row) => row.status === "PAID" || row.status === "PROVISIONING")
      .map((row) => refreshTravelOrderProvisioning(row.id).catch(() => undefined)),
  );

  const refreshed = rows.length ? await memberOrderRows(user.id) : rows;
  const records = refreshed.map(toGuestOrderRecord);
  // Ownership was already checked by memberOrderRows; an unavailable usage read must not hide orders.
  const usageByOrder = await readStoredUsageForOrders(
    records.map((record) => record.providerOrderNo),
  ).catch(() => new Map());
  return records.map((record) => {
    const usage = record.providerOrderNo ? usageByOrder.get(record.providerOrderNo) : undefined;
    return usage ? { ...record, usage } : record;
  });
};

export const getMemberOrders = createServerFn({ method: "GET" }).handler(getMemberOrdersHandler);

const claimSchema = z.object({
  orderId: z.string().uuid(),
  accessToken: z.string().min(32).max(256),
});

/**
 * Claim a guest order into the signed-in member account.
 *
 * The guest token is the proof of purchase, and it is verified by comparing its hash against the
 * stored hash — never by matching the email the browser supplied. A token for an order already
 * bound to a different subject is refused, so a claim cannot move somebody else's purchase.
 *
 * Idempotent: re-claiming an already-owned order returns `already_member` and the order keeps
 * appearing exactly once in the member history.
 */
export const claimGuestOrderForMemberInput = (data: z.input<typeof claimSchema>) =>
  claimSchema.parse(data);
export const claimGuestOrderForMemberHandler = async ({
  data,
}: {
  data: ReturnType<typeof claimGuestOrderForMemberInput>;
}) => {
  const user = await getAuthenticatedUser();
  const rows = await db
    .select({
      id: customerOrders.id,
      customerAuthSubject: customerOrders.customerAuthSubject,
    })
    .from(customerOrders)
    .innerJoin(guestOrderAccess, eq(guestOrderAccess.orderId, customerOrders.id))
    .where(eq(customerOrders.id, data.orderId))
    .limit(1);
  const order = rows[0];
  if (!order) throw new Error("Pesanan tidak ditemukan");

  const tokenHash = hashGuestAccessToken(data.accessToken);
  const accessRows = await db
    .select({ accessTokenHash: guestOrderAccess.accessTokenHash })
    .from(guestOrderAccess)
    .where(eq(guestOrderAccess.orderId, data.orderId))
    .limit(1);
  const guestTokenVerified = accessRows[0]?.accessTokenHash === tokenHash;

  const decision: ClaimDecision = claimGuestOrder({
    authSubject: user.id,
    guestTokenVerified,
    orderSubject: order.customerAuthSubject,
  });

  await db.insert(orderClaimEvents).values({
    orderId: data.orderId,
    customerAuthSubject: user.id,
    outcome: decision.claim
      ? "CLAIMED"
      : decision.reason === "already_member"
        ? "ALREADY_MEMBER"
        : decision.reason === "owned_by_other"
          ? "OWNED_BY_OTHER"
          : "UNVERIFIED",
    // Only a fingerprint is stored; the bearer token itself never reaches the database.
    presentedTokenHash: decision.claim ? tokenHash : null,
  });

  if (!decision.claim) return { claimed: false, reason: decision.reason };

  // Conditional on the subject still being empty so two concurrent claims cannot both win.
  const updated = await db
    .update(customerOrders)
    .set({ customerAuthSubject: user.id, customerAuthLinkedAt: new Date().toISOString() })
    .where(and(eq(customerOrders.id, data.orderId), isNull(customerOrders.customerAuthSubject)))
    .returning({ id: customerOrders.id });
  return { claimed: updated.length > 0, reason: decision.reason };
};

export const claimGuestOrderForMember = createServerFn({ method: "POST" })
  .validator(claimSchema)
  .handler(claimGuestOrderForMemberHandler);

export const memberOrderContract = {
  identity: "resolved server-side from the verified Better Auth session cookie",
  predicate: "customer_orders.customer_auth_subject = session subject",
  guestPath: "unchanged: guest_order_access token hash",
  claim: "POST { orderId, accessToken }; the token hash must match the stored hash",
  secrets: "eSIM payloads are decrypted only after ownership is proven and only when installable",
} as const;
