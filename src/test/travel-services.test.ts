import { describe, expect, it } from "vitest";
import {
  serviceHref,
  serviceStatusLabel,
  travelServices,
  visibleTravelServices,
} from "../lib/travel-services";

describe("travel service configuration", () => {
  it("exposes the configured services in display order", () => {
    const services = visibleTravelServices();
    expect(services).toHaveLength(8);
    expect(services.map((item) => item.id)).toEqual([
      "esim",
      "flights",
      "attractions",
      "open-trip",
      "baggage",
      "personal-shopper",
      "visa",
      "travel-insurance",
    ]);
    expect(serviceStatusLabel.COMING_SOON).toBe("Segera hadir");
  });

  it("only active services can navigate, and Tiket opens the flight search", () => {
    for (const service of travelServices) {
      const expected =
        service.status !== "ACTIVE" ? null : service.id === "flights" ? "/tiket" : "/esim/finder";
      expect(serviceHref(service)).toBe(expected);
    }
  });
});
