import { describe, expect, it } from "vitest";
import { parseCanonicalWalletResponse, classifyCanonicalWalletError, canonicalWalletPayload } from "@/lib/customer-wallet.server";
import { groupWalletLedger, ledgerStatusLabel } from "@/lib/customer-wallet-view";
import { quickActionSoonCopy, WALLET_ACTIONS, QUICK_ACTION_SUPPORT_COPY } from "@/lib/wallet-quick-actions";

const wallet = {
  customer_id: "customer-1",
  currency: "IDR" as const,
  available_balance: 120000,
  held_balance: 0,
  total_credited: 200000,
  total_debited: 80000,
  status: "active" as const,
  updated_at: "2026-10-01T00:00:00.000Z",
};
const entry = (id: string, created_at: string, direction: "credit" | "debit" = "credit") => ({
  id, amount: 10000, direction, balance_after: 120000, status: "posted", transaction_type: "top_up",
  reference_type: "invoice", reference_id: id, note: null, created_at,
});

describe("canonical customer Wallet adapter", () => {
  it("rejects malformed responses and an owner mismatch", () => {
    expect(() => parseCanonicalWalletResponse({ wallet: null, ledger: [{ nope: true }] }, "customer-1")).toThrow("tidak valid");
    expect(() => parseCanonicalWalletResponse({ wallet: { ...wallet, customer_id: "other" }, ledger: [] }, "customer-1")).toThrow("pemilik akun");
  });

  it("accepts the canonical wallet shape and standard success envelope", () => {
    expect(parseCanonicalWalletResponse({ success: true, wallet, ledger: [entry("a", "2026-10-01T10:00:00Z")] }, "customer-1").wallet?.available_balance).toBe(120000);
  });

  it("classifies canonical errors without leaking provider details", () => {
    expect(classifyCanonicalWalletError(400, { success: false, error: { code: "CUSTOMER_ACCESS_DENIED", message: "internal detail" } })).toBe("Wallet belum terhubung ke akun ini.");
    expect(classifyCanonicalWalletError(500, { success: false, error: { code: "DB_ERROR", message: "internal detail" } })).toBe("Saldo Djiwa Pay belum dapat dimuat. Coba lagi.");
  });

  it("sends the verified profile email with its canonical source id", () => {
    expect(canonicalWalletPayload({ sourceId: "customer-1", email: "A@EXAMPLE.COM" })).toEqual({
      action: "get",
      sourceId: "customer-1",
      email: "A@EXAMPLE.COM",
    });
  });
});

describe("Wallet ledger presentation", () => {
  it("groups newest-first by canonical created_at month and maps statuses", () => {
    const groups = groupWalletLedger([
      entry("old", "2026-09-30T10:00:00Z", "debit"),
      entry("new", "2026-10-01T10:00:00Z"),
      entry("newer", "2026-10-05T10:00:00Z"),
    ]);
    expect(groups.map((group) => group.key)).toEqual(["2026-10", "2026-09"]);
    expect(groups[0]?.entries.map((item) => item.id)).toEqual(["newer", "new"]);
    expect(ledgerStatusLabel("pending")).toBe("Menunggu");
    expect(ledgerStatusLabel("posted")).toBe("Berhasil");
  });
});

describe("Wallet quick actions", () => {
  it("keeps the eight Travel actions and supported mapping", () => {
    expect(WALLET_ACTIONS.map(({ label }) => label)).toEqual([
      "Isi Saldo", "Kirim", "Terima", "Scan QR", "Riwayat", "Kartu", "Tarik Dana", "Bantuan",
    ]);
    expect(WALLET_ACTIONS.map(({ supported }) => supported)).toEqual([
      true, false, false, false, true, false, false, true,
    ]);
    expect(WALLET_ACTIONS.every(({ asset }) => asset.startsWith("/assets/djiwa-pay-actions/") && asset.endsWith(".webp"))).toBe(true);
  });

  it("uses truthful copy for unsupported actions and bantuan", () => {
    expect(quickActionSoonCopy("Kirim")).toBe("Fitur Kirim sedang kami siapkan untuk Djiwa Pay.");
    expect(quickActionSoonCopy("Scan QR")).toBe("Fitur Scan QR sedang kami siapkan untuk Djiwa Pay.");
    expect(QUICK_ACTION_SUPPORT_COPY).toContain("customer service");
  });
});
