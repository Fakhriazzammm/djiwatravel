import { describe, expect, it } from "vitest";
import { buildEsimWalletCards, daysLeft } from "../lib/esim-home-wallet";
import type { Order } from "../lib/orders";

const NOW = Date.parse("2026-10-31T00:00:00Z");
const DAY = 86_400_000;

const order = (overrides: Partial<Order> = {}): Order => ({
  id: "o1",
  packageId: "JP-5GB-7D",
  packageName: "Jepang 5GB",
  locationCodes: ["JP"],
  durationDays: 7,
  volumeBytes: 5_000_000_000,
  amount: 125_000,
  method: "qris",
  status: "INSTALLED",
  createdAt: NOW,
  ...overrides,
});

describe("buildEsimWalletCards", () => {
  it("derives remaining data, percent, used data and days left for an active eSIM", () => {
    const [card] = buildEsimWalletCards(
      [order({ usedGb: 2.4, expiresAt: NOW + 3 * DAY - 1_000 })],
      NOW,
    );
    expect(card).toMatchObject({
      kind: "active",
      headline: "2.6 GB",
      caption: "tersisa dari 5.0 GB",
      percent: 52,
      usedLabel: "Terpakai 2.4 GB",
      timeLabel: "Sisa 3 hari",
      tone: "normal",
    });
  });

  it("flags low quota with the Admin threshold and offers renewal", () => {
    const orders = [order({ usedGb: 3.5 })];
    expect(buildEsimWalletCards(orders, NOW, 20)[0]?.kind).toBe("active");
    const [low] = buildEsimWalletCards(orders, NOW, 40);
    expect(low).toMatchObject({ kind: "low", tone: "low" });
    expect(low?.action).toMatchObject({ kind: "buy", packageId: "JP-5GB-7D", primary: true });
  });

  it("does not invent a percentage when the provider reports no usage", () => {
    const [card] = buildEsimWalletCards([order()], NOW);
    expect(card?.percent).toBeNull();
    expect(card?.caption).toBe("pemakaian belum dilaporkan");
    expect(card?.headline).toBe("5.0 GB");
  });

  it("treats a ready eSIM as full and installable, and an expired one as buy-again", () => {
    const cards = buildEsimWalletCards(
      [
        order({ id: "r", status: "READY" }),
        order({ id: "e", status: "INSTALLED", expiresAt: NOW - DAY, locationCodes: ["TH"] }),
      ],
      NOW,
    );
    expect(cards[0]).toMatchObject({
      kind: "ready",
      percent: 100,
      timeLabel: "Aktif setelah dipasang",
    });
    expect(cards[0]?.action).toMatchObject({ kind: "link", label: "Pasang eSIM" });
    expect(cards[1]).toMatchObject({ kind: "expired", tone: "muted", percent: null });
    expect(cards[1]?.timeLabel).toMatch(/^Berakhir /);
    expect(cards[1]?.action).toMatchObject({ kind: "buy", label: "Beli lagi" });
  });

  it("orders low, active, ready, in progress, expired and drops cancelled or refunded orders", () => {
    const cards = buildEsimWalletCards(
      [
        order({ id: "exp", status: "EXPIRED" }),
        order({ id: "prov", status: "PROVISIONING" }),
        order({ id: "ready", status: "READY" }),
        order({ id: "ok", usedGb: 1 }),
        order({ id: "low", usedGb: 4.8 }),
        order({ id: "x", status: "CANCELLED" }),
        order({ id: "y", status: "REFUNDED" }),
      ],
      NOW,
    );
    expect(cards.map((card) => card.id)).toEqual(["low", "ok", "ready", "prov", "exp"]);
  });

  it("sends unpaid orders to the order page", () => {
    const [card] = buildEsimWalletCards([order({ status: "WAITING_PAYMENT" })], NOW);
    expect(card).toMatchObject({ kind: "pending", pendingTitle: "Pembayaran belum selesai" });
    expect(card?.target).toEqual({ kind: "order", id: "o1" });
    expect(card?.action).toMatchObject({ label: "Lanjutkan pembayaran", primary: true });
  });
});

describe("daysLeft", () => {
  it("rounds up and is null once the plan has ended", () => {
    expect(daysLeft(NOW + 2.2 * DAY, NOW)).toBe(3);
    expect(daysLeft(NOW + 60_000, NOW)).toBe(1);
    expect(daysLeft(NOW - 1, NOW)).toBeNull();
    expect(daysLeft(undefined, NOW)).toBeNull();
  });
});
