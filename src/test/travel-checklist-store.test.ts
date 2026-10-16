import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAllTripPlans,
  clearTripPlan,
  readTripPlan,
  setChecklistItem,
  tripPlanKey,
  writeDepartureDate,
} from "../lib/travel-checklist-store";

const ORDER_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const ORDER_B = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

beforeEach(() => {
  localStorage.clear();
});

describe("trip plan store", () => {
  it("returns an empty plan for an unknown order", () => {
    expect(readTripPlan(ORDER_A)).toEqual({ departureDate: null, completed: {}, updatedAt: expect.any(Number) });
  });

  it("scopes one plan per order so orders never share a checklist", () => {
    writeDepartureDate(ORDER_A, "2026-08-10");
    setChecklistItem(ORDER_A, "install", true);

    expect(readTripPlan(ORDER_A).departureDate).toBe("2026-08-10");
    expect(readTripPlan(ORDER_A).completed["install"]).toBeTypeOf("number");
    expect(readTripPlan(ORDER_B).departureDate).toBeNull();
    expect(readTripPlan(ORDER_B).completed).toEqual({});
  });

  it("refuses a departure date that is not a real calendar date", () => {
    writeDepartureDate(ORDER_A, "2026-02-31");
    expect(readTripPlan(ORDER_A).departureDate).toBeNull();
  });

  it("clears the departure date without dropping checklist progress", () => {
    writeDepartureDate(ORDER_A, "2026-08-10");
    setChecklistItem(ORDER_A, "device", true);
    writeDepartureDate(ORDER_A, null);

    const plan = readTripPlan(ORDER_A);
    expect(plan.departureDate).toBeNull();
    expect(plan.completed["device"]).toBeTypeOf("number");
  });

  it("removes a tick when the customer unchecks the item", () => {
    setChecklistItem(ORDER_A, "install", true);
    expect(readTripPlan(ORDER_A).completed["install"]).toBeTypeOf("number");
    setChecklistItem(ORDER_A, "install", false);
    expect(readTripPlan(ORDER_A).completed["install"]).toBeUndefined();
  });

  it("drops unknown or malformed stored payloads instead of trusting them", () => {
    localStorage.setItem(tripPlanKey(ORDER_A), "{not json");
    expect(readTripPlan(ORDER_A).completed).toEqual({});

    localStorage.setItem(
      tripPlanKey(ORDER_A),
      JSON.stringify({ departureDate: "nope", completed: { install: "yes", device: 12 } }),
    );
    const plan = readTripPlan(ORDER_A);
    expect(plan.departureDate).toBeNull();
    expect(plan.completed["install"]).toBeUndefined();
    expect(plan.completed["device"]).toBe(12);
  });

  it("clears a single order plan and every plan on sign-out", () => {
    writeDepartureDate(ORDER_A, "2026-08-10");
    writeDepartureDate(ORDER_B, "2026-09-10");
    clearTripPlan(ORDER_A);
    expect(readTripPlan(ORDER_A).departureDate).toBeNull();
    expect(readTripPlan(ORDER_B).departureDate).toBe("2026-09-10");

    clearAllTripPlans();
    expect(readTripPlan(ORDER_B).departureDate).toBeNull();
    expect(localStorage.getItem(tripPlanKey(ORDER_B))).toBeNull();
  });
});
