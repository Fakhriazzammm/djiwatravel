import { describe, expect, it } from "vitest";
import { calendarDate } from "@/lib/google-calendar.server";

describe("Google Calendar date values", () => {
  it("normalizes PostgreSQL Date values to a calendar date", () => {
    expect(calendarDate(new Date("2026-10-29T00:00:00.000Z"))).toBe("2026-10-29");
  });
});
