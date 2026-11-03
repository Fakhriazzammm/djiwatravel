import { describe, expect, it } from "vitest";
import { ticketStub } from "@/lib/trip-ticket";

const today = "2026-11-03";

describe("trip ticket stub", () => {
  it("asks for dates when none are set", () => {
    expect(ticketStub({ departure_date: null }, today)).toEqual({ value: "Atur", unit: "TANGGAL" });
  });

  it("counts days until departure", () => {
    expect(ticketStub({ departure_date: "2026-12-12", return_date: "2026-12-16" }, today)).toEqual({
      value: "39",
      unit: "HARI",
    });
  });

  it("marks departure day, ongoing day number and finished trips", () => {
    expect(ticketStub({ departure_date: today, return_date: "2026-11-07" }, today)).toEqual({
      value: "Hari ini",
      unit: "BERANGKAT",
    });
    expect(ticketStub({ departure_date: "2026-11-01", return_date: "2026-11-07" }, today)).toEqual({
      value: "3",
      unit: "HARI KE-",
    });
    expect(ticketStub({ departure_date: "2026-10-01", return_date: "2026-10-05" }, today)).toEqual({
      value: "✓",
      unit: "SELESAI",
    });
  });
});
