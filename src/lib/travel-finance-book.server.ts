import { z } from "zod";

/**
 * Client for the Travel finance book gateway.
 *
 * The book lives in the shared finance service, so the Travel host never holds a database
 * credential for it: it asks the gateway, authenticated with the shared settlement secret.
 */

const BOOK_SEGMENT = "travel-finance-ledger";
const MAX_ENTRIES = 2000;

/** Derive the ledger endpoint from the settlement URL so both stay on the same host. */
export function travelBookUrl(settlementUrl: string): string {
  const url = new URL(settlementUrl);
  if (!/\/travel-finance-settlement$/.test(url.pathname)) {
    throw new Error("Travel finance settlement URL is not recognised");
  }
  url.pathname = url.pathname.replace(/\/travel-finance-settlement$/, `/${BOOK_SEGMENT}`);
  return url.toString();
}

export type TravelFinanceEntry = {
  sourceId: string;
  txType: "income" | "expense";
  amount: number;
  category: string | null;
  merchant: string | null;
  description: string | null;
  occurredAtMs: number;
  status: string | null;
};

export type TravelFinanceCategoryRow = {
  category: string;
  txType: "income" | "expense";
  amount: number;
  count: number;
};

export type TravelFinanceReport = {
  days: number;
  truncated: boolean;
  totals: {
    income: number;
    expense: number;
    net: number;
    incomeCount: number;
    expenseCount: number;
  };
  byCategory: TravelFinanceCategoryRow[];
  daily: Array<{ day: string; income: number; expense: number }>;
  recent: TravelFinanceEntry[];
};

function fail(): never {
  throw new Error("Travel finance book response is invalid");
}

function readAmount(value: unknown): number {
  const amount = Number(value);
  if (!Number.isFinite(amount)) fail();
  return Math.round(amount);
}

function readTextOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === "string" ? value : String(value);
}

function parseEntry(value: unknown): TravelFinanceEntry {
  if (!value || typeof value !== "object") fail();
  const item = value as Record<string, unknown>;
  const txType = item["txType"];
  if (txType !== "income" && txType !== "expense") fail();
  return {
    sourceId: String(item["sourceId"] ?? ""),
    txType,
    amount: readAmount(item["amount"]),
    category: readTextOrNull(item["category"]),
    merchant: readTextOrNull(item["merchant"]),
    description: readTextOrNull(item["description"]),
    occurredAtMs: readAmount(item["txDateMs"]),
    status: readTextOrNull(item["status"]),
  };
}

/** The gateway is trusted infrastructure, but its response is still validated before display. */
export function parseTravelFinanceReport(value: unknown): TravelFinanceReport {
  if (!value || typeof value !== "object") fail();
  const body = value as Record<string, unknown>;
  if (body["ok"] !== true) fail();
  const totals = body["totals"];
  if (!totals || typeof totals !== "object") fail();
  const totalsRow = totals as Record<string, unknown>;
  const rawRecent = body["recent"];
  const rawCategories = body["byCategory"];
  const rawDaily = body["daily"];
  if (!Array.isArray(rawRecent) || !Array.isArray(rawCategories) || !Array.isArray(rawDaily))
    fail();

  return {
    days: readAmount(body["days"]),
    truncated: body["truncated"] === true,
    totals: {
      income: readAmount(totalsRow["income"]),
      expense: readAmount(totalsRow["expense"]),
      net: readAmount(totalsRow["net"]),
      incomeCount: readAmount(totalsRow["incomeCount"]),
      expenseCount: readAmount(totalsRow["expenseCount"]),
    },
    byCategory: rawCategories.slice(0, 200).map((row) => {
      if (!row || typeof row !== "object") fail();
      const item = row as Record<string, unknown>;
      const txType = item["txType"];
      if (txType !== "income" && txType !== "expense") fail();
      return {
        category: readTextOrNull(item["category"]) ?? "Lainnya",
        txType,
        amount: readAmount(item["amount"]),
        count: readAmount(item["count"]),
      };
    }),
    daily: rawDaily.slice(0, 400).map((row) => {
      if (!row || typeof row !== "object") fail();
      const item = row as Record<string, unknown>;
      return {
        day: String(item["day"] ?? "unknown"),
        income: readAmount(item["income"]),
        expense: readAmount(item["expense"]),
      };
    }),
    recent: rawRecent.slice(0, MAX_ENTRIES).map(parseEntry),
  };
}

function configuredTravelBook(): { url: string; secret: string } {
  const rawUrl = process.env["DJIWA_TRAVEL_FINANCE_SETTLEMENT_URL"]?.trim();
  const secret = process.env["DJIWA_TRAVEL_SETTLEMENT_SECRET"];
  if (!rawUrl || !secret) throw new Error("Travel finance settlement is not configured");
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Travel finance settlement URL must use HTTPS");
  return { url: travelBookUrl(url.toString()), secret };
}

async function callBook(payload: Record<string, unknown>): Promise<unknown> {
  const { url, secret } = configuredTravelBook();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-djiwa-travel-settlement-secret": secret,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("Travel finance book is unavailable");
  return await response.json();
}

export async function fetchTravelFinanceReport(days = 30): Promise<TravelFinanceReport> {
  return parseTravelFinanceReport(await callBook({ action: "report", days }));
}

export const travelExpenseInputSchema = z.object({
  externalId: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  amount: z.number().int().min(1).max(1_000_000_000),
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(200),
  merchant: z.string().trim().max(80).optional(),
  paymentMethod: z.string().trim().max(40).optional(),
  occurredAtMs: z.number().int().positive().optional(),
});

export type TravelExpenseInput = z.infer<typeof travelExpenseInputSchema>;

export type TravelExpenseResult = { duplicate: boolean; sourceId: string };

export async function recordTravelExpense(input: TravelExpenseInput): Promise<TravelExpenseResult> {
  const parsed = travelExpenseInputSchema.parse(input);
  const result = await callBook({
    action: "expense",
    ...parsed,
    metadata: { channel: "admin" },
  });
  if (!result || typeof result !== "object" || (result as Record<string, unknown>)["ok"] !== true) {
    throw new Error("Travel finance book rejected the expense");
  }
  const body = result as Record<string, unknown>;
  return { duplicate: body["duplicate"] === true, sourceId: String(body["sourceId"] ?? "") };
}
