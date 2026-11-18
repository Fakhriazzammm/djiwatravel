import { describe, expect, it } from "vitest";
import {
  biggestLeak,
  buildCohorts,
  deltaPct,
  funnelView,
  healthScore,
  retentionPct,
  rfmSegment,
  toCsv,
} from "@/lib/analytics-insights";

describe("rfmSegment", () => {
  it("puts account holders without purchases in prospect", () => {
    expect(rfmSegment(0, null)).toBe("prospect");
  });
  it("classifies by purchase count and recency", () => {
    expect(rfmSegment(4, 10)).toBe("champion");
    expect(rfmSegment(2, 100)).toBe("loyal");
    expect(rfmSegment(1, 5)).toBe("new");
    expect(rfmSegment(3, 200)).toBe("at_risk");
    expect(rfmSegment(1, 200)).toBe("sleeping");
    expect(rfmSegment(5, 400)).toBe("lost");
  });
  it("always returns a segment for edge values", () => {
    for (const orders of [1, 2, 3, 10])
      for (const days of [0, 29, 31, 60, 61, 90, 91, 120, 121, 365, 366])
        expect(rfmSegment(orders, days)).toBeTruthy();
  });
});

describe("healthScore", () => {
  it("rewards recent repeat buyers", () => {
    expect(
      healthScore({ paidOrders: 3, daysSinceLast: 10, openSupport: 0, refunds: 0, failedOrders: 0 })
        .band,
    ).toBe("sehat");
  });
  it("penalises refunds, open cases and failures", () => {
    const r = healthScore({
      paidOrders: 1,
      daysSinceLast: 200,
      openSupport: 2,
      refunds: 2,
      failedOrders: 2,
    });
    expect(r.band).toBe("berisiko");
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
  it("stays within 0..100", () => {
    expect(
      healthScore({ paidOrders: 99, daysSinceLast: 0, openSupport: 0, refunds: 0, failedOrders: 0 })
        .score,
    ).toBeLessThanOrEqual(100);
    expect(
      healthScore({
        paidOrders: 0,
        daysSinceLast: null,
        openSupport: 9,
        refunds: 9,
        failedOrders: 9,
      }).score,
    ).toBe(0);
  });
});

describe("cohorts", () => {
  it("counts week 0 as the whole cohort and hides future weeks", () => {
    const rows = buildCohorts(
      [
        { firstWeek: "2026-10-05", weeksActive: [1] },
        { firstWeek: "2026-10-05", weeksActive: [] },
      ],
      4,
      () => 2,
    );
    expect(rows[0]?.size).toBe(2);
    expect(rows[0]?.retained).toEqual([2, 1, 0, -1, -1]);
    expect(retentionPct(2, 1)).toBe(50);
    expect(retentionPct(2, -1)).toBeNull();
    expect(retentionPct(0, 0)).toBeNull();
  });
});

describe("funnel", () => {
  const steps = [
    { key: "a", label: "A", value: 100 },
    { key: "b", label: "B", value: 40 },
    { key: "c", label: "C", value: 10 },
  ];
  it("computes share of top and previous step", () => {
    const v = funnelView(steps);
    expect(v[1]?.ofTop).toBe(40);
    expect(v[2]?.ofPrev).toBe(25);
    expect(v[2]?.dropped).toBe(30);
  });
  it("finds the biggest relative leak", () => {
    expect(biggestLeak(funnelView(steps))?.key).toBe("c");
    expect(biggestLeak(funnelView([{ key: "a", label: "A", value: 0 }]))).toBeNull();
  });
});

describe("helpers", () => {
  it("computes period delta safely", () => {
    expect(deltaPct(150, 100)).toBe(50);
    expect(deltaPct(5, 0)).toBeNull();
    expect(deltaPct(0, 0)).toBe(0);
  });
  it("neutralises spreadsheet formulas and quotes commas in CSV", () => {
    const csv = toCsv([['=HYPERLINK("x")', "a,b", 5, null]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('"a,b"');
  });
});

import { buildWeeklyReport, evaluateAlerts, type AlertInput } from "@/lib/analytics-insights";
import { isoWeekKey } from "@/lib/analytics-report.server";

const calm: AlertInput = {
  revenue: 1_000_000,
  previousRevenue: 1_000_000,
  orders: 10,
  previousOrders: 10,
  refundCount: 0,
  paidOrders: 10,
  failedProvisioning: 0,
  stuckProvisioning: 0,
  deadLetters: 0,
  staleWorkers: [],
  emailFailed: 0,
  preorderOverdue: 0,
  preorderNear: 0,
  supportOpenOver3d: 0,
  shoppingOverdue: 0,
  feedReportsOpen: 0,
  paymentsUnknown: 0,
};

describe("evaluateAlerts", () => {
  it("is quiet when everything is healthy", () => {
    expect(evaluateAlerts(calm)).toEqual([]);
  });
  it("puts critical alerts first", () => {
    const keys = evaluateAlerts({
      ...calm,
      feedReportsOpen: 2,
      supportOpenOver3d: 1,
      preorderOverdue: 1,
      staleWorkers: ["esim-sync"],
    }).map((a) => a.key);
    expect(keys.slice(0, 2).sort()).toEqual(["preorder-overdue", "worker-stale"]);
    expect(keys[keys.length - 1]).toBe("feed-reports");
  });
  it("flags a revenue drop only when there was enough volume", () => {
    expect(evaluateAlerts({ ...calm, revenue: 500_000 }).map((a) => a.key)).toContain(
      "revenue-drop",
    );
    expect(
      evaluateAlerts({ ...calm, revenue: 100_000, previousRevenue: 1_000_000, previousOrders: 2 }),
    ).toEqual([]);
  });
  it("flags high refund and provisioning failure rates", () => {
    const keys = evaluateAlerts({ ...calm, refundCount: 2, failedProvisioning: 1 }).map(
      (a) => a.key,
    );
    expect(keys).toContain("refund-rate");
    expect(keys).toContain("provisioning-failure-rate");
  });
});

describe("weekly report", () => {
  it("renders text and escaped html with alerts", () => {
    const report = buildWeeklyReport({
      periodLabel: "1 Nov – 8 Nov",
      revenue: 2_000_000,
      previousRevenue: 1_000_000,
      orders: 4,
      previousOrders: 2,
      newMembers: 3,
      topDestinations: [{ code: "jp", revenue: 1_500_000, orders: 3 }],
      alerts: [
        { key: "x", severity: "critical", title: "<b>Bahaya</b>", detail: "d", href: "/admin" },
      ],
      baseUrl: "https://djiwatravel.com",
    });
    expect(report.text).toContain("naik 100%");
    expect(report.text).toContain("JP");
    expect(report.html).toContain("&lt;b&gt;Bahaya");
    expect(report.html).not.toContain("<b>Bahaya");
  });
  it("keys one report per ISO week", () => {
    expect(isoWeekKey(new Date("2026-11-16T03:00:00Z"))).toBe("2026-W47");
    expect(isoWeekKey(new Date("2026-11-22T20:00:00Z"))).toBe("2026-W47");
    expect(isoWeekKey(new Date("2026-11-23T01:00:00Z"))).toBe("2026-W48");
  });
});
