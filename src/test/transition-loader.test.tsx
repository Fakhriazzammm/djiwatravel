import { describe, expect, it } from "vitest";

import { TRANSITION_MIN_VISIBLE_MS, transitionVisible } from "@/components/transition-loader";

// Every page change must show the loader, so the rules are pinned: never hide while a load
// is running, and always stay visible for the minimum window after the page changed.
describe("transition loader visibility", () => {
  it("is visible right after a page change", () => {
    expect(transitionVisible({ stillLoading: false, sinceChangeMs: 0 })).toBe(true);
  });

  it("stays visible for the whole minimum window", () => {
    expect(transitionVisible({ stillLoading: false, sinceChangeMs: TRANSITION_MIN_VISIBLE_MS - 1 })).toBe(true);
  });

  it("hides once the window has passed and nothing is loading", () => {
    expect(transitionVisible({ stillLoading: false, sinceChangeMs: TRANSITION_MIN_VISIBLE_MS })).toBe(false);
  });

  it("keeps showing while the next page is still loading", () => {
    expect(transitionVisible({ stillLoading: true, sinceChangeMs: TRANSITION_MIN_VISIBLE_MS * 5 })).toBe(true);
  });
});
