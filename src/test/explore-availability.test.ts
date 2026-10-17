import { describe, expect, it } from "vitest";

import { destinations } from "@/lib/catalog";
import { exploreAvailability, exploreErrorState } from "@/lib/explore-availability";

describe("Explore availability failure state", () => {
  it("does not fabricate destinations or packages after a provider failure", () => {
    const state = exploreErrorState();
    expect(state.source).toBe("error");
    expect(state.destinations).toEqual([]);
    expect(state.errorMessage).toContain("Katalog");
  });

  it("preserves a successful destination result and its source", () => {
    const state = exploreAvailability(destinations.slice(0, 1), "cached");
    expect(state.source).toBe("cached");
    expect(state.destinations).toHaveLength(1);
  });
});
