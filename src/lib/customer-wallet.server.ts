import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireBetterAuthUser, resolveCanonicalCustomerSourceId } from "./customer-profile.server";

const walletSchema = z.object({
  customer_id: z.string(),
  currency: z.literal("IDR"),
  available_balance: z.number().finite(),
  held_balance: z.number().finite(),
  total_credited: z.number().finite(),
  total_debited: z.number().finite(),
  status: z.enum(["active", "blocked"]),
  updated_at: z.string(),
});

const ledgerEntrySchema = z.object({
  id: z.union([z.string(), z.number()]),
  amount: z.number().finite(),
  direction: z.enum(["credit", "debit"]),
  balance_after: z.number().finite(),
  status: z.string(),
  transaction_type: z.string(),
  reference_type: z.string().nullable(),
  reference_id: z.string().nullable(),
  note: z.string().nullable(),
  created_at: z.string(),
});

const walletResponseSchema = z.object({
  wallet: walletSchema.nullable(),
  ledger: z.array(ledgerEntrySchema),
});

export type CustomerWallet = z.infer<typeof walletSchema>;
export type CustomerWalletLedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type CustomerWalletResponse = z.infer<typeof walletResponseSchema>;

function canonicalWalletUrl() {
  const value = process.env["DJIWA_PAY_CUSTOMER_WALLET_URL"]?.trim();
  if (!value) throw new Error("Saldo Djiwa Pay belum tersedia untuk Djiwa Travel");
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("Endpoint Djiwa Pay harus menggunakan HTTPS");
  return url.toString();
}

export function parseCanonicalWalletResponse(raw: unknown, sourceId: string): CustomerWalletResponse {
  const parsed = walletResponseSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Respons saldo Djiwa Pay tidak valid");
  if (parsed.data.wallet && parsed.data.wallet.customer_id !== sourceId) {
    throw new Error("Respons saldo Djiwa Pay tidak sesuai dengan pemilik akun");
  }
  return parsed.data;
}

export async function readCanonicalWalletForRequest(request: Request) {
  const cookie = request.headers.get("cookie");
  const user = await requireBetterAuthUser(cookie ?? "");
  const sourceId = await resolveCanonicalCustomerSourceId(user.email, cookie ?? undefined);
  const response = await fetch(canonicalWalletUrl(), {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ action: "get", sourceId, email: user.email }),
  });
  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    const message = raw && typeof raw === "object" && "error" in raw && typeof raw.error === "string"
      ? raw.error
      : "Saldo Djiwa Pay belum dapat dimuat. Coba lagi.";
    throw new Error(message);
  }
  return parseCanonicalWalletResponse(raw, sourceId);
}

export const getCustomerWallet = createServerFn({ method: "GET" }).handler(async () => {
  return readCanonicalWalletForRequest(new Request("https://djiwatravel.com/api/customer-wallet", {
    headers: { cookie: getRequestHeader("cookie") ?? "" },
  }));
});

export const customerWalletContract = {
  auth: "Better Auth session and canonical customer profile are required",
  identity: "sourceId is resolved server-side and never accepted from the browser",
  read: "POST { action: get, sourceId, email } to the configured canonical wallet endpoint",
  settlement: "pending invoices never change wallet balance until canonical settlement",
} as const;
