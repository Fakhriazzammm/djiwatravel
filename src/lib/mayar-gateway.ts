import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const invoiceSchema = z.object({
  orderId: z.string().min(1).max(128),
  amountIdr: z.number().int().positive(),
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().email(),
  customerMobile: z.string().trim().min(8).max(24),
  description: z.string().trim().min(1).max(240),
  redirectUrl: z.string().url(),
});

function mayarConfig() {
  const apiKey = process.env.MAYAR_API_KEY;
  if (!apiKey) throw new Error("Payment provider belum dikonfigurasi");
  return { apiKey, baseUrl: (process.env.MAYAR_API_BASE || "https://api.mayar.id/hl/v2").replace(/\/$/, "") };
}

export function buildMayarInvoicePayload(input: z.infer<typeof invoiceSchema>) {
  return {
    name: input.customerName,
    email: input.customerEmail,
    mobile: input.customerMobile,
    amount: input.amountIdr,
    description: input.description,
    redirectUrl: input.redirectUrl,
    extraData: { orderId: input.orderId },
    items: [{ quantity: 1, rate: input.amountIdr, description: input.description }],
  };
}

export const createMayarInvoice = createServerFn({ method: "POST" })
  .validator(invoiceSchema)
  .handler(async ({ data }) => {
    const { apiKey, baseUrl } = mayarConfig();
    const response = await fetch(`${baseUrl}/invoices/create`, { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify(buildMayarInvoicePayload(data)), signal: AbortSignal.timeout(15_000) });
    const body = await response.json().catch(() => ({})) as { data?: Record<string, unknown>; messages?: string; message?: string };
    if (!response.ok) throw new Error(body.messages || body.message || `Payment provider error ${response.status}`);
    return { invoiceId: String(body.data?.id ?? ""), transactionId: String(body.data?.transactionId ?? ""), paymentUrl: String(body.data?.link ?? body.data?.paymentUrl ?? "") };
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
