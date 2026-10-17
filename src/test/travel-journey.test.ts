import { describe, expect, it } from "vitest";
import {
  activationTimeline,
  buildTravelChecklist,
  calendarDaysUntil,
  checklistProgress,
  departureLabel,
  formatGb,
  parseDepartureDate,
  reorderIntent,
  toDepartureDateValue,
  usageView,
  type ActivationState,
} from "../lib/travel-journey";
import type { OrderStatus } from "../lib/orders";

const ALL_STATUSES: OrderStatus[] = [
  "ORDER_CREATED",
  "WAITING_PAYMENT",
  "PAID",
  "PROVISIONING",
  "READY",
  "INSTALLED",
  "EXPIRED",
  "PROVISIONING_FAILED",
  "CANCELLED",
  "REFUNDED",
];

describe("activationTimeline", () => {
  it("describes every order status with all four stages", () => {
    for (const status of ALL_STATUSES) {
      const timeline = activationTimeline(status);
      expect(timeline.stages).toHaveLength(4);
      expect(timeline.headline.length).toBeGreaterThan(0);
      expect(timeline.hint.length).toBeGreaterThan(0);
    }
  });

  it("only marks the active stage done once the eSIM is actually installed", () => {
    for (const status of ALL_STATUSES) {
      const activeStage = activationTimeline(status).stages.find((stage) => stage.id === "active");
      const done = activeStage?.state === "done";
      if (status === "INSTALLED" || status === "EXPIRED") expect(done).toBe(true);
      else expect(done).toBe(false);
    }
  });

  it("does not report success while provisioning is still running", () => {
    const timeline = activationTimeline("PROVISIONING");
    expect(timeline.state).toBe("in_progress");
    expect(timeline.stages.map((stage) => stage.state)).toEqual([
      "done",
      "current",
      "todo",
      "todo",
    ]);
  });

  it("marks the failed stage instead of the ready stage", () => {
    const timeline = activationTimeline("PROVISIONING_FAILED");
    expect(timeline.state).toBe("failed");
    expect(timeline.stages.find((stage) => stage.id === "processing")?.state).toBe("failed");
    expect(timeline.stages.find((stage) => stage.id === "ready")?.state).toBe("todo");
  });

  it("stops offering a refresh once the state is terminal", () => {
    expect(activationTimeline("EXPIRED").canRefresh).toBe(false);
    expect(activationTimeline("CANCELLED").canRefresh).toBe(false);
    expect(activationTimeline("READY").canRefresh).toBe(true);
  });

  it("maps every status to a defined customer-facing state", () => {
    const allowed: ActivationState[] = [
      "in_progress",
      "ready",
      "active",
      "expired",
      "failed",
      "cancelled",
      "refunded",
    ];
    for (const status of ALL_STATUSES) {
      expect(allowed).toContain(activationTimeline(status).state);
    }
  });
});

describe("usageView", () => {
  it("never reports zero usage when the provider has not reported anything", () => {
    const view = usageView({ volumeBytes: 5_000_000_000, usedGb: null, active: true });
    expect(view.kind).toBe("unavailable");
    expect(view.usedBytes).toBeNull();
    expect(view.remainingBytes).toBeNull();
  });

  it("stays unavailable while the eSIM is not active yet", () => {
    const view = usageView({ volumeBytes: 5_000_000_000, usedGb: 1, active: false });
    expect(view.kind).toBe("unavailable");
  });

  it("computes remaining quota from provider numbers", () => {
    const view = usageView({
      volumeBytes: 10_000_000_000,
      usedGb: 2.5,
      active: true,
      measuredAt: 1,
    });
    expect(view.kind).toBe("measured");
    expect(view.totalBytes).toBe(10_000_000_000);
    expect(view.usedBytes).toBe(2_500_000_000);
    expect(view.remainingBytes).toBe(7_500_000_000);
    expect(view.remainingPercent).toBe(75);
    expect(view.low).toBe(false);
  });

  it("flags a low balance without hiding the number", () => {
    const view = usageView({ volumeBytes: 10_000_000_000, usedGb: 9, active: true });
    expect(view.remainingPercent).toBe(10);
    expect(view.low).toBe(true);
  });

  it("treats a package without a fixed volume as unlimited", () => {
    const view = usageView({ volumeBytes: null, usedGb: 3, active: true });
    expect(view.kind).toBe("unlimited");
    expect(view.remainingBytes).toBeNull();
  });

  it("ignores non-numeric provider payloads", () => {
    const view = usageView({
      volumeBytes: Number.NaN,
      usedGb: Number.POSITIVE_INFINITY,
      active: true,
    });
    expect(view.kind).toBe("unavailable");
  });

  it("formats bytes in GB", () => {
    expect(formatGb(1_500_000_000)).toBe("1.5 GB");
  });
});

describe("departure dates", () => {
  it("accepts a real calendar date", () => {
    expect(parseDepartureDate("2026-08-10")).toBe(new Date(2026, 7, 10).getTime());
  });

  it("rejects a date that does not exist", () => {
    expect(parseDepartureDate("2026-02-31")).toBeNull();
  });

  it("rejects empty, malformed and non-string input", () => {
    expect(parseDepartureDate("")).toBeNull();
    expect(parseDepartureDate("10/08/2026")).toBeNull();
    expect(parseDepartureDate(null)).toBeNull();
    expect(parseDepartureDate(undefined)).toBeNull();
  });

  it("round-trips a timestamp through the date input value", () => {
    const timestamp = new Date(2026, 0, 5).getTime();
    expect(parseDepartureDate(toDepartureDateValue(timestamp))).toBe(timestamp);
  });

  it("counts whole calendar days regardless of clock time", () => {
    const now = new Date(2026, 7, 1, 23, 30).getTime();
    expect(calendarDaysUntil(new Date(2026, 7, 2, 0, 5).getTime(), now)).toBe(1);
    expect(calendarDaysUntil(new Date(2026, 7, 1, 0, 5).getTime(), now)).toBe(0);
    expect(calendarDaysUntil(new Date(2026, 6, 30).getTime(), now)).toBe(-2);
  });

  it("labels the countdown in customer words", () => {
    expect(departureLabel(0)).toBe("Hari keberangkatan");
    expect(departureLabel(1)).toBe("Besok berangkat");
    expect(departureLabel(7)).toBe("H-7");
    expect(departureLabel(-2)).toBe("Sudah berangkat 2 hari lalu");
  });
});

describe("buildTravelChecklist", () => {
  const now = new Date(2026, 7, 1, 12).getTime();

  it("keeps every item available without a departure date", () => {
    const items = buildTravelChecklist({ departureDate: null, now });
    expect(items).toHaveLength(5);
    expect(items.every((item) => item.state === "no-date")).toBe(true);
    expect(items.every((item) => item.milestone === null)).toBe(true);
  });

  it("marks the day-of items due on the departure day and pre-trip items upcoming", () => {
    const departure = toDepartureDateValue(new Date(2026, 7, 10).getTime());
    const items = buildTravelChecklist({ departureDate: departure, now });
    const install = items.find((item) => item.key === "install");
    const roaming = items.find((item) => item.key === "data-roaming");
    expect(install?.state).toBe("upcoming");
    expect(install?.milestone).toBe("H-1");
    expect(roaming?.state).toBe("upcoming");
    expect(roaming?.milestone).toBe("Hari H");
  });

  it("turns an item due once its milestone passes", () => {
    const departure = toDepartureDateValue(new Date(2026, 7, 3).getTime());
    const items = buildTravelChecklist({ departureDate: departure, now });
    expect(items.find((item) => item.key === "device")?.state).toBe("due");
  });

  it("keeps completed items ticked and counts progress", () => {
    const items = buildTravelChecklist({
      departureDate: null,
      completed: { install: now, "save-qr": now },
      now,
    });
    expect(items.filter((item) => item.state === "done")).toHaveLength(2);
    expect(items.find((item) => item.key === "install")?.state).toBe("done");
    expect(checklistProgress(items)).toEqual({ done: 2, total: 5, percent: 40 });
  });

  it("ignores completion stamps that are not real timestamps", () => {
    const items = buildTravelChecklist({
      departureDate: null,
      completed: { install: "yes" as unknown as number, nope: 1 },
      now,
    });
    expect(items.find((item) => item.key === "install")?.state).not.toBe("done");
  });
});

describe("reorderIntent", () => {
  it("points at the canonical checkout route so the price is re-read server-side", () => {
    const intent = reorderIntent({ packageId: "JP-5GB", status: "EXPIRED", locationCodes: ["JP"] });
    expect(intent.href).toBe("/checkout/$id");
    expect(intent.packageId).toBe("JP-5GB");
    expect(intent.kind).toBe("renewal");
    expect(intent.fallbackDestinationCode).toBe("JP");
  });

  it("labels a fresh purchase as reorder and survives a missing destination", () => {
    const intent = reorderIntent({ packageId: "SG-3GB", status: "READY" });
    expect(intent.kind).toBe("reorder");
    expect(intent.label).toBe("Beli lagi");
    expect(intent.fallbackDestinationCode).toBeNull();
  });
});
