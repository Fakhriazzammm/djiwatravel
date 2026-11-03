import { describe, expect, it } from "vitest";
import {
  buildAttention,
  compactMoney,
  groupOverviewDays,
  pickOverviewDay,
} from "@/lib/trip-overview";

describe("trip overview model", () => {
  it("groups activities by day and keeps the server order inside a day", () => {
    const days = groupOverviewDays([
      { id: "a", activity_date: "2026-11-03" },
      { id: "b", activity_date: "2026-11-04" },
      { id: "c", activity_date: new Date("2026-11-04T00:00:00Z") },
      { id: "x", activity_date: null },
    ]);
    expect(days.map((d) => [d.date, d.items.map((i) => i.id)])).toEqual([
      ["2026-11-03", ["a"]],
      ["2026-11-04", ["b", "c"]],
    ]);
  });

  it("opens on today, else the next day with plans, else the last day", () => {
    const dates = ["2026-11-03", "2026-11-05"];
    expect(pickOverviewDay(dates, "2026-11-03")).toBe("2026-11-03");
    expect(pickOverviewDay(dates, "2026-11-04")).toBe("2026-11-05");
    expect(pickOverviewDay(dates, "2026-12-01")).toBe("2026-11-05");
    expect(pickOverviewDay([], "2026-11-04")).toBe("");
  });

  it("lists waiting bookings before open checklist items and skips finished ones", () => {
    const items = buildAttention(
      [
        { id: "c1", title: "Paspor", is_completed: true },
        { id: "c2", title: "eSIM", is_completed: false },
      ],
      [
        { id: "b1", title: "Hotel", status: "pending" },
        { id: "b2", title: "Tiket", status: "confirmed" },
      ],
    );
    expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual(["booking:b1", "checklist:c2"]);
    expect(buildAttention([{ id: "c2", is_completed: false }], [], 0)).toEqual([]);
  });

  it("shortens rupiah for the stat tile", () => {
    expect(compactMoney(755_000_000, "Rp 7.550.000")).toBe("7,6 jt");
    expect(compactMoney(45_000_000, "Rp 450.000")).toBe("450 rb");
    expect(compactMoney(5_000, "Rp 50")).toBe("Rp 50");
    expect(compactMoney(100_000, "¥1,000")).toBe("¥1,000");
  });
});
