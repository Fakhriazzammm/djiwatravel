import { describe, expect, it, vi } from "vitest";

import { destinations } from "@/lib/catalog";
import {
  EXPLORE_LOADER_DEADLINE_MS,
  exploreAvailability,
  loadExploreAvailability,
} from "@/lib/explore-availability";

describe("Explore loader recovery", () => {
  it("returns the list when a slow first attempt recovers on the second", async () => {
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new Error("Explore catalog deadline exceeded"))
      .mockResolvedValueOnce(exploreAvailability(destinations.slice(0, 3), "live"));

    const state = await loadExploreAvailability({ attempt });

    expect(state.source).toBe("live");
    expect(state.destinations).toHaveLength(3);
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("only shows the actionable error after both attempts fail", async () => {
    const attempt = vi.fn().mockRejectedValue(new Error("Explore catalog deadline exceeded"));

    const state = await loadExploreAvailability({ attempt });

    expect(state.source).toBe("error");
    expect(state.destinations).toEqual([]);
    expect(state.errorMessage).toContain("Katalog");
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("gives the provider read its own budget instead of a tighter route deadline", async () => {
    const attempt = vi.fn().mockResolvedValue(exploreAvailability([], "live"));

    await loadExploreAvailability({ attempt });

    expect(EXPLORE_LOADER_DEADLINE_MS).toBeGreaterThanOrEqual(8_000);
    expect(attempt).toHaveBeenCalledWith(EXPLORE_LOADER_DEADLINE_MS);
  });

  it("does not touch the provider twice when the first attempt succeeds", async () => {
    const attempt = vi
      .fn()
      .mockResolvedValue(exploreAvailability(destinations.slice(0, 1), "cached"));

    const state = await loadExploreAvailability({ attempt });

    expect(state.source).toBe("cached");
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
