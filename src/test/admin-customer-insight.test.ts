import { describe, expect, it } from "vitest";
import {
  customerSegment,
  engagementScore,
  featureUsage,
  healthAlerts,
  monthlyActivity,
  spend,
  timeline,
} from "@/lib/admin-customer-insight";
import type { AdminCustomerDetail } from "@/lib/admin-customers.server";

type D = NonNullable<AdminCustomerDetail>;
const NOW = Date.parse("2026-11-20T00:00:00Z");

function make(over: Partial<D> = {}): D {
  return {
    id: "u1",
    kind: "member",
    displayName: "Rani",
    email: "r@example.com",
    whatsapp: "+62811",
    profile: {
      nationality: "ID",
      dateOfBirth: "1995-01-01",
      gender: "female",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    orders: [],
    trips: [],
    shopping: [],
    shipping: [],
    feeds: { posts: [], comments: 0, likes: 0 },
    consents: [],
    ...over,
  };
}
const order = (over: Partial<D["orders"][number]> = {}): D["orders"][number] => ({
  id: "o",
  code: "A1",
  status: "READY",
  total: "15000",
  currency: "IDR",
  paidAt: "2026-11-10T00:00:00Z",
  createdAt: "2026-11-09T00:00:00Z",
  items: "Japan 1GB",
  ...over,
});

describe("customer insight", () => {
  it("adds paid eSIM, paid Titip Belanja and paid Kirim Barang, ignoring unpaid ones", () => {
    const d = make({
      orders: [order(), order({ id: "o2", status: "PENDING", paidAt: null, total: "99999" })],
      shopping: [
        {
          code: "T1",
          status: "PAID",
          totalIdr: 50000,
          paidAt: "2026-11-01T00:00:00Z",
          recipientName: null,
          recipientWhatsapp: null,
          city: null,
          createdAt: "2026-11-01T00:00:00Z",
        },
        {
          code: "T2",
          status: "QUOTED",
          totalIdr: 70000,
          paidAt: null,
          recipientName: null,
          recipientWhatsapp: null,
          city: null,
          createdAt: "2026-11-02T00:00:00Z",
        },
      ],
      shipping: [
        {
          code: "K1",
          status: "PAID",
          country: "JP",
          estimatedKg: 2,
          totalIdr: 300000,
          paidAt: "2026-11-03T00:00:00Z",
          createdAt: "2026-11-02T00:00:00Z",
        },
      ],
    });
    expect(spend(d)).toMatchObject({
      esim: 15000,
      shop: 50000,
      ship: 300000,
      total: 365000,
      paidOrders: 3,
    });
  });

  it("scores feature use, a paid purchase and a complete profile", () => {
    expect(engagementScore(make())).toBe(5 + 3);
    const rich = make({
      orders: [order()],
      trips: [
        {
          name: "x",
          destination: "JP",
          departure: null,
          returnDate: null,
          archived: false,
          createdAt: "2026-02-01T00:00:00Z",
        },
      ],
      consents: [{ purpose: "ai", granted: true, at: "2026-02-01T00:00:00Z", source: "prompt" }],
    });
    expect(engagementScore(rich)).toBe(25 + 15 + 10 + 5 + 3 + 2);
    expect(featureUsage(rich).find((f) => f.id === "trip")?.count).toBe(1);
  });

  it("segments loyal, slipping, new and guest customers", () => {
    expect(
      customerSegment(make({ orders: [order(), order({ id: "b" }), order({ id: "c" })] }), NOW).id,
    ).toBe("loyal");
    expect(
      customerSegment(
        make({
          orders: [order({ paidAt: "2026-05-01T00:00:00Z", createdAt: "2026-05-01T00:00:00Z" })],
        }),
        NOW,
      ).id,
    ).toBe("slipping");
    expect(
      customerSegment(
        make({
          profile: {
            nationality: null,
            dateOfBirth: null,
            gender: null,
            createdAt: "2026-11-15T00:00:00Z",
            updatedAt: "2026-11-15T00:00:00Z",
          },
        }),
        NOW,
      ).id,
    ).toBe("new");
    expect(customerSegment(make({ kind: "guest", profile: null }), NOW).id).toBe("guest");
  });

  it("raises alerts for stuck payments, problems, missing contact and refused consent", () => {
    const d = make({
      whatsapp: null,
      orders: [
        order({ status: "PENDING_PAYMENT", paidAt: null, createdAt: "2026-11-10T00:00:00Z" }),
      ],
      shipping: [
        {
          code: "K1",
          status: "PROBLEM",
          country: "JP",
          estimatedKg: 1,
          totalIdr: null,
          paidAt: null,
          createdAt: "2026-11-19T00:00:00Z",
        },
      ],
      consents: [
        { purpose: "promo", granted: false, at: "2026-11-01T00:00:00Z", source: "prompt" },
      ],
    });
    const text = healthAlerts(d, NOW)
      .map((a) => a.text)
      .join("|");
    expect(text).toMatch(/belum dibayar lebih dari 24 jam/);
    expect(text).toMatch(/bermasalah/);
    expect(text).toMatch(/WhatsApp belum tersimpan/);
    expect(text).toMatch(/persetujuan data ditolak/);
    expect(healthAlerts(make({ orders: [order()] }), NOW)).toEqual([]);
  });

  it("builds a newest-first timeline and a 12-month activity series", () => {
    const d = make({ orders: [order()] });
    const events = timeline(d);
    expect(events[0]?.title).toMatch(/Membayar eSIM/);
    expect(events.map((e) => e.kind)).toContain("profile");
    const months = monthlyActivity(d, 12, new Date(NOW));
    expect(months).toHaveLength(12);
    expect(months.at(-1)?.key).toBe("2026-11");
    expect(months.at(-1)?.count).toBe(2);
  });
});
