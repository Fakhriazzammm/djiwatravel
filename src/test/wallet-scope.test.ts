import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DJIWA_TRAVEL_SOURCE_APP,
  WALLET_SCOPES,
  WALLET_SCOPE_LABELS,
  filterLedgerByScope,
  isWalletScope,
  normalizeSourceApp,
  parseWalletScope,
} from "@/lib/wallet-scope";
import {
  canonicalWalletPayload,
  readCanonicalWalletForRequest,
  walletScopeInput,
  type CustomerWalletLedgerEntry,
} from "@/lib/customer-wallet.server";

const wallet = {
  customer_id: "djiwa-customer-1",
  currency: "IDR" as const,
  available_balance: 120000,
  held_balance: 0,
  total_credited: 200000,
  total_debited: 80000,
  status: "active" as const,
  updated_at: "2026-10-01T00:00:00.000Z",
};

const row = (id: string, source_app: string | null = null): CustomerWalletLedgerEntry => ({
  id,
  amount: 10000,
  direction: "credit",
  balance_after: 120000,
  status: "posted",
  transaction_type: "top_up",
  reference_type: "invoice",
  reference_id: id,
  note: null,
  created_at: "2026-10-01T10:00:00.000Z",
  source_app,
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Wallet history scope contract", () => {
  it("is an allow-list of two Indonesian-labelled options", () => {
    expect(WALLET_SCOPES).toEqual(["all", DJIWA_TRAVEL_SOURCE_APP]);
    expect(WALLET_SCOPE_LABELS).toEqual({ all: "Semua transaksi", "djiwa-travel": "Djiwa Travel" });
    expect(isWalletScope("djiwa-travel")).toBe(true);
    expect(isWalletScope("djiwa-tentram")).toBe(false);
  });

  it("treats an absent value as the default scope and fails closed on anything unknown", () => {
    expect(parseWalletScope(undefined)).toBe("all");
    expect(parseWalletScope(null)).toBe("all");
    expect(parseWalletScope("")).toBe("all");
    expect(parseWalletScope("djiwa-travel")).toBe("djiwa-travel");
    for (const hostile of ["*", "DJIWA-TRAVEL", "all;drop", 1, {}, ["djiwa-travel"]]) {
      expect(() => parseWalletScope(hostile)).toThrow("Filter riwayat Wallet tidak dikenal");
    }
  });

  it("treats a missing or blank canonical provenance as unattributed, never inferred", () => {
    expect(normalizeSourceApp(" Djiwa-Travel ")).toBe("djiwa-travel");
    expect(normalizeSourceApp(null)).toBeNull();
    expect(normalizeSourceApp(undefined)).toBeNull();
    expect(normalizeSourceApp("   ")).toBeNull();
    expect(normalizeSourceApp(7)).toBeNull();
  });

  it("keeps every canonical row for the default scope", () => {
    const rows = [row("a"), row("b", "djiwa-tentram"), row("c", null)];
    expect(filterLedgerByScope(rows, "all")).toEqual(rows);
  });

  it("projects the Djiwa Travel scope with Travel rows in and other/unknown rows out", () => {
    const rows = [
      row("travel", "djiwa-travel"),
      row("travel-trimmed", " Djiwa-Travel "),
      row("tentram", "djiwa-tentram"),
      row("yumme", "yumme"),
      row("legacy-null", null),
      row("legacy-absent"),
    ];
    expect(filterLedgerByScope(rows, "djiwa-travel").map((entry) => entry.id)).toEqual([
      "travel",
      "travel-trimmed",
    ]);
  });
});

describe("Wallet scope server boundary", () => {
  it("only lets an allow-listed scope through, and never accepts provenance from input", () => {
    expect(walletScopeInput()).toEqual({ scope: "all" });
    expect(walletScopeInput({ scope: "djiwa-travel" })).toEqual({ scope: "djiwa-travel" });
    expect(() => walletScopeInput({ scope: "djiwa-tentram" })).toThrow("tidak dikenal");
    // A browser cannot smuggle provenance through the request payload.
    const hostileInput = { scope: "all", source_app: "djiwa-travel", sourceId: "someone-else" };
    expect(walletScopeInput(hostileInput)).toEqual({ scope: "all" });
  });

  it("keeps the canonical default payload byte-identical and only adds an allow-listed sourceApp", () => {
    const identity = { sourceId: "djiwa-customer-1", email: "A@EXAMPLE.COM" };
    expect(canonicalWalletPayload(identity)).toEqual({
      action: "get",
      sourceId: "djiwa-customer-1",
      email: "A@EXAMPLE.COM",
    });
    expect(canonicalWalletPayload(identity, "all")).toEqual(canonicalWalletPayload(identity));
    expect(canonicalWalletPayload(identity, "djiwa-travel")).toEqual({
      action: "get",
      sourceId: "djiwa-customer-1",
      email: "A@EXAMPLE.COM",
      sourceApp: "djiwa-travel",
    });
  });

  it("rejects an invalid scope before any network call", async () => {
    vi.stubEnv("DJIWA_PAY_CUSTOMER_WALLET_URL", "https://wallet.internal/customer-wallet");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      readCanonicalWalletForRequest(
        new Request("https://djiwatravel.com/api/customer-wallet", {
          headers: { cookie: "better-auth-session=secret" },
        }),
        "djiwa-tentram",
      ),
    ).rejects.toThrow("tidak dikenal");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("filters the canonical ledger for the Travel scope and keeps the default read untouched", async () => {
    vi.stubEnv("DJIWA_PAY_CUSTOMER_WALLET_URL", "https://wallet.internal/customer-wallet");
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith("/api/auth/get-session")) {
          return new Response(
            JSON.stringify({ user: { id: "abcdef1234567890", email: "a@example.com" } }),
            { status: 200 },
          );
        }
        if (String(url).endsWith("/api/customer/profile")) {
          return new Response(
            JSON.stringify({ customer: { source_id: "djiwa-customer-1", email: "a@example.com" } }),
            { status: 200 },
          );
        }
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(
          JSON.stringify({
            success: true,
            wallet,
            ledger: [
              row("travel", "djiwa-travel"),
              row("tentram", "djiwa-tentram"),
              row("legacy", null),
            ],
          }),
          { status: 200 },
        );
      }),
    );

    const request = () =>
      new Request("https://djiwatravel.com/api/customer-wallet", {
        headers: { cookie: "better-auth-session=secret" },
      });

    const travel = await readCanonicalWalletForRequest(request(), "djiwa-travel");
    expect(travel.wallet?.available_balance).toBe(120000);
    expect(travel.ledger.map((entry) => entry.id)).toEqual(["travel"]);
    expect(bodies.at(-1)).toEqual({
      action: "get",
      sourceId: "djiwa-customer-1",
      email: "a@example.com",
      sourceApp: "djiwa-travel",
    });

    const all = await readCanonicalWalletForRequest(request());
    expect(all.ledger.map((entry) => entry.id)).toEqual(["travel", "tentram", "legacy"]);
    expect(bodies.at(-1)).toEqual({
      action: "get",
      sourceId: "djiwa-customer-1",
      email: "a@example.com",
    });
  });

  it("preserves the existing canonical get error states", async () => {
    vi.stubEnv("DJIWA_PAY_CUSTOMER_WALLET_URL", "https://wallet.internal/customer-wallet");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/api/auth/get-session")) {
          return new Response(
            JSON.stringify({ user: { id: "abcdef1234567890", email: "a@example.com" } }),
            { status: 200 },
          );
        }
        if (String(url).endsWith("/api/customer/profile")) {
          return new Response(
            JSON.stringify({ customer: { source_id: "djiwa-customer-1", email: "a@example.com" } }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            success: false,
            error: { code: "DB_ERROR", message: "internal detail" },
          }),
          { status: 500 },
        );
      }),
    );
    const request = () =>
      new Request("https://djiwatravel.com/api/customer-wallet", {
        headers: { cookie: "better-auth-session=secret" },
      });

    await expect(readCanonicalWalletForRequest(request(), "djiwa-travel")).rejects.toThrow(
      "Saldo Djiwa Pay belum dapat dimuat. Coba lagi.",
    );
    await expect(readCanonicalWalletForRequest(request())).rejects.toThrow(
      "Saldo Djiwa Pay belum dapat dimuat. Coba lagi.",
    );
  });

  it("requires a Better Auth session before reading the wallet for any scope", async () => {
    vi.stubEnv("DJIWA_PAY_CUSTOMER_WALLET_URL", "https://wallet.internal/customer-wallet");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      readCanonicalWalletForRequest(
        new Request("https://djiwatravel.com/api/customer-wallet"),
        "djiwa-travel",
      ),
    ).rejects.toThrow("Autentikasi diperlukan");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
