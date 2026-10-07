import { and, eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { db } from "../db/client.server";
import { customerOrders, guestOrderAccess } from "../../drizzle/schema";
import { hashGuestAccessToken } from "./guest-order-access.server";

const invoicePayloadSchema = z.object({
  orderId: z.string().uuid(),
  amountIdr: z.number().int().positive(),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().email(),
  customerMobile: z.string().trim().min(8).max(24),
  description: z.string().trim().min(1).max(240),
  redirectUrl: z.string().url(),
});
const invoiceSchema = invoicePayloadSchema.extend({
  accessToken: z.string().min(32).max(256),
  amountIdr: z.number().int().positive(),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().email(),
  customerMobile: z.string().trim().min(8).max(24),
  description: z.string().trim().min(1).max(240),
  redirectUrl: z.string().url(),
});

function mayarConfig() {
  const apiKey = process.env["MAYAR_API_KEY"];
  if (!apiKey) throw new Error("Payment provider belum dikonfigurasi");
  return { apiKey, baseUrl: (process.env["MAYAR_API_BASE"] || "https://api.mayar.id/hl/v2").replace(/\/$/, "") };
}

export function buildMayarInvoicePayload(input: z.input<typeof invoicePayloadSchema>) {
  return {
    name: input.customerName,
    email: input.customerEmail,
    mobile: input.customerMobile,
    description: input.description,
    redirectUrl: input.redirectUrl,
    extraData: { app: "djiwa-travel", orderId: input.orderId },
    items: [{ quantity: 1, rate: input.amountIdr, description: input.description }],
  };
}

export const createMayarInvoice = createServerFn({ method: "POST" })
  .validator(invoiceSchema)
  .handler(async ({ data }) => {
    const accessHash = hashGuestAccessToken(data.accessToken);
    const rows = await db
      .select({ order: customerOrders, access: guestOrderAccess })
      .from(customerOrders)
      .innerJoin(guestOrderAccess, eq(guestOrderAccess.orderId, customerOrders.id))
      .where(and(eq(customerOrders.id, data.orderId), eq(guestOrderAccess.accessTokenHash, accessHash)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error("Pesanan tidak ditemukan");
    const expectedAmount = Number(row.order.totalAmount);
    if (!Number.isSafeInteger(expectedAmount) || expectedAmount !== data.amountIdr) throw new Error("Nominal pesanan berubah");
    if (row.order.paymentProvider === "mayar" && row.order.paymentReference) {
      const snapshot = row.order.priceSnapshot && typeof row.order.priceSnapshot === "object" ? row.order.priceSnapshot as Record<string, unknown> : {};
      const mayar = snapshot["mayar"] && typeof snapshot["mayar"] === "object" ? snapshot["mayar"] as Record<string, unknown> : {};
      if (typeof mayar["paymentUrl"] === "string" && mayar["paymentUrl"]) return { invoiceId: String(mayar["invoiceId"] || row.order.paymentReference), transactionId: String(mayar["transactionId"] || ""), paymentUrl: mayar["paymentUrl"] };
      throw new Error("Tagihan pesanan sudah dibuat tetapi link pembayaran tidak tersedia");
    }
    const { apiKey, baseUrl } = mayarConfig();
    const response = await fetch(`${baseUrl}/invoices/create`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(buildMayarInvoicePayload(data)),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => ({})) as { data?: Record<string, unknown>; messages?: string; message?: string };
    if (!response.ok) throw new Error(body.messages || body.message || `Payment provider error ${response.status}`);
    const invoiceId = String(body.data?.["id"] ?? "");
    const transactionId = String(body.data?.["transactionId"] ?? "");
    const paymentUrl = String(body.data?.["link"] ?? body.data?.["paymentUrl"] ?? "");
    if (!invoiceId || !transactionId || !paymentUrl) throw new Error("Respons invoice Mayar tidak lengkap");
    const currentSnapshot = row.order.priceSnapshot && typeof row.order.priceSnapshot === "object" ? row.order.priceSnapshot as Record<string, unknown> : {};
    await db.update(customerOrders).set({ status: "PAYMENT_PENDING", paymentProvider: "mayar", paymentReference: invoiceId, priceSnapshot: { ...currentSnapshot, mayar: { invoiceId, transactionId, paymentUrl } } }).where(eq(customerOrders.id, data.orderId));
    return { invoiceId, transactionId, paymentUrl };
  });

export const getMayarTransaction = createServerFn({ method: "POST" })
  .validator(z.object({ transactionId: z.string().min(1).max(160) }))
  .handler(async ({ data }) => {
    const { apiKey, baseUrl } = mayarConfig();
    const response = await fetch(`${baseUrl}/transactions/${encodeURIComponent(data.transactionId)}`, { headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    const body = await response.json().catch(() => ({})) as { data?: { status?: string }; messages?: string; message?: string };
    if (!response.ok) throw new Error(body.messages || body.message || `Payment verification error ${response.status}`);
    if (String(body.data?.status).toLowerCase() !== "paid") throw new Error("Pembayaran belum terverifikasi");
    return body.data;
  });
