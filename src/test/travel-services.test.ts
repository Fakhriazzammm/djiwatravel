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
    expect(services).toHaveLength(9);
    expect(services.map((item) => item.id)).toEqual([
      "esim",
      "flights",
      "templates",
      "attractions",
      "open-trip",
      "shipping",
      "personal-shopper",
      "visa",
      "travel-insurance",
    ]);
    expect(serviceStatusLabel.COMING_SOON).toBe("Segera hadir");
  });

  it("only active services can navigate, Tiket opens the flight search and Template opens the gallery", () => {
    for (const service of travelServices) {
      const expected =
        service.status !== "ACTIVE"
          ? null
          : service.id === "flights"
            ? "/tiket"
            : service.id === "templates"
              ? "/template"
              : "/esim/finder";
      expect(serviceHref(service)).toBe(expected);
    }
  });
});
