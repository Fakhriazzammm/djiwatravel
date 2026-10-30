import { describe, expect, it } from "vitest";
import type { Order } from "@/lib/orders";
import { buildEsimHomeSummary } from "@/lib/esim-home-summary";

const NOW = Date.parse("2026-10-31T00:00:00Z");

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    packageId: "JP-5GB-7D",
    packageName: "Jepang 5GB",
    locationCodes: ["JP"],
    durationDays: 7,
    volumeBytes: 5_000_000_000,
    amount: 125_000,
    method: "qris",
    status: "INSTALLED",
    createdAt: Date.parse("2026-10-01T00:00:00Z"),
    ...overrides,
  };
}

describe("buildEsimHomeSummary", () => {
  it("returns a finder CTA for a customer without eSIM orders", () => {
    const summary = buildEsimHomeSummary([]);

    expect(summary.kind).toBe("empty");
    expect(summary.title).toBe("Internet siap sebelum berangkat");
    expect(summary.target).toEqual({ kind: "finder" });
    expect(summary.primaryAction).toEqual({
      label: "Cari eSIM",
      target: { kind: "finder" },
    });
  });

  it("prioritizes a low-quota installed eSIM and points renewal to canonical checkout", () => {
    const summary = buildEsimHomeSummary(
      [
        order({ id: "healthy", packageId: "SG-10GB-15D", status: "INSTALLED", usedGb: 2 }),
        order({ id: "low", usedGb: 4.5 }),
      ],
      NOW,
    );

    expect(summary.kind).toBe("low");
    expect(summary.remainingPercent).toBe(10);
    expect(summary.primaryAction.label).toBe("Beli paket lagi");
    expect(summary.primaryAction.target).toEqual({ kind: "checkout", id: "JP-5GB-7D" });
  });

  it("describes an installed order with unavailable usage instead of inventing zero", () => {
    const summary = buildEsimHomeSummary([order()], NOW);

    expect(summary.kind).toBe("active");
    expect(summary.quotaLabel).toMatch(/pemakaian belum dilaporkan penyedia/i);
    expect(summary.quotaLabel).not.toMatch(/Sisa 0(?:\.0)? GB/);
  });

  it("exposes the destination, flag, data and real expiry for the grouped card", () => {
    const summary = buildEsimHomeSummary(
      [order({ usedGb: 2.5, expiresAt: Date.parse("2026-11-12T06:00:00Z") })],
      NOW,
    );

    expect(summary.kind).toBe("active");
    expect(summary.location).toBe("Jepang");
    expect(summary.flag).toBe("🇯🇵");
    expect(summary.dataLabel).toBe("5.0 GB");
    expect(summary.expiresLabel).toBe("Aktif hingga 12 Nov");
  });

  it("omits the expiry line when the order has no usable expiry date", () => {
    expect(buildEsimHomeSummary([order()], NOW).expiresLabel).toBeUndefined();
    expect(
      buildEsimHomeSummary([order({ expiresAt: NOW - 1_000 })], NOW).expiresLabel,
    ).toBeUndefined();
  });

  it("surfaces an unfinished payment before a healthy active eSIM", () => {
    const summary = buildEsimHomeSummary(
      [
        order({ id: "active", usedGb: 2.5 }),
        order({
          id: "unpaid",
          packageId: "SG-5GB-7D",
          locationCodes: ["SG"],
          status: "WAITING_PAYMENT",
          createdAt: NOW + 1_000,
        }),
      ],
      NOW,
    );

    expect(summary.kind).toBe("pending");
    expect(summary.title).toBe("Pembayaran belum selesai");
    expect(summary.target).toEqual({ kind: "order", id: "unpaid" });
    expect(summary.orderCode).toBeUndefined();
    expect(summary.amountLabel).toBe("Rp125.000");
  });

  it("keeps a small remaining balance visible in MB rather than rounding it to zero GB", () => {
    const summary = buildEsimHomeSummary([order({ usedGb: 4.98 })], NOW);
    expect(summary.kind).toBe("low");
    expect(summary.quotaValue).toBe("20 MB");
    expect(summary.quotaCaption).toContain("<1% tersisa");
  });

  it("routes a ready order to its detail page for installation", () => {
    const summary = buildEsimHomeSummary([order({ id: "ready-1", status: "READY" })], NOW);

    expect(summary.kind).toBe("ready");
    expect(summary.target).toEqual({ kind: "detail", id: "ready-1" });
    expect(summary.primaryAction.label).toBe("Pasang eSIM");
  });

  it("routes a pending payment to order status and labels the next customer action", () => {
    const summary = buildEsimHomeSummary(
      [order({ id: "pending-1", status: "WAITING_PAYMENT", createdAt: NOW - 60_000 })],
      NOW,
    );

    expect(summary.kind).toBe("pending");
    expect(summary.primaryAction.label).toBe("Lanjutkan pembayaran");
    expect(summary.primaryAction.target).toEqual({ kind: "order", id: "pending-1" });
  });

  it("points a failed provisioning order to its status, avoiding a duplicate purchase", () => {
    const summary = buildEsimHomeSummary([order({ status: "PROVISIONING_FAILED" })], NOW);
    expect(summary.kind).toBe("pending");
    expect(summary.title).toBe("eSIM perlu bantuan");
    expect(summary.primaryAction).toEqual({
      label: "Lihat status",
      target: { kind: "order", id: "order-1" },
    });
  });

  it("uses latest terminal history when no active or pending order remains", () => {
    const summary = buildEsimHomeSummary(
      [
        order({ id: "old", status: "CANCELLED", createdAt: NOW - 86_400_000 * 4 }),
        order({
          id: "latest",
          packageId: "TH-3GB-7D",
          status: "EXPIRED",
          createdAt: NOW - 86_400_000,
        }),
      ],
      NOW,
    );

    expect(summary.kind).toBe("history");
    expect(summary.primaryAction.label).toBe("Beli paket lagi");
    expect(summary.primaryAction.target).toEqual({ kind: "checkout", id: "TH-3GB-7D" });
  });

  it("treats an expired installed order as history and exposes the full list when multiple orders exist", () => {
    const summary = buildEsimHomeSummary(
      [
        order({ id: "expired-1", status: "INSTALLED", expiresAt: NOW - 1_000 }),
        order({ id: "cancelled-1", status: "CANCELLED", createdAt: NOW - 2_000 }),
      ],
      NOW,
    );

    expect(summary.kind).toBe("history");
    expect(summary.hasMultiple).toBe(true);
  });
});
