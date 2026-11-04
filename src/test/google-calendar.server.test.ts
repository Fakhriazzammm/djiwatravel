import { describe, expect, it } from "vitest";
import { calendarDate, eventBody, reminderOverrides } from "@/lib/google-calendar.server";

describe("Google Calendar date values", () => {
  it("normalizes PostgreSQL Date values to a calendar date", () => {
    expect(calendarDate(new Date("2026-10-29T00:00:00.000Z"))).toBe("2026-10-29");
  });
});

describe("Google Calendar reminders", () => {
  const trip = { name: "Bali", destination_name: "Bali" };
  const base = {
    id: "i1",
    trip_id: "t1",
    activity_date: "2026-12-14",
    end_time: null,
    timezone: "Asia/Jakarta",
    title: "Check-in",
    location: null,
    notes: null,
    booking_reference: null,
  };

  it("never relies on the calendar default and sets exactly two popups on a timed event", () => {
    const body = eventBody({ ...base, start_time: "14:00" }, trip) as {
      reminders: { useDefault: boolean; overrides: Array<{ method: string; minutes: number }> };
    };
    expect(body.reminders.useDefault).toBe(false);
    expect(body.reminders.overrides).toEqual([
      { method: "popup", minutes: 120 },
      { method: "popup", minutes: 30 },
    ]);
  });

  it("reminds an all-day event at 09:00 two days and one day before", () => {
    const body = eventBody({ ...base, start_time: null }, trip) as {
      reminders: { overrides: Array<{ minutes: number }> };
    };
    // Google counts from 00:00 of the event day: 39h and 15h before it.
    expect(body.reminders.overrides.map((r) => r.minutes)).toEqual([39 * 60, 15 * 60]);
  });

  it("keeps the two reminders at different times and within Google's limits", () => {
    for (const timed of [true, false]) {
      const minutes = reminderOverrides(timed).map((r) => r.minutes);
      expect(new Set(minutes).size).toBe(2);
      expect(minutes.every((m) => m >= 0 && m <= 40320)).toBe(true);
    }
  });
});
