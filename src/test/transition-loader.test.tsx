import { describe, expect, it } from "vitest";

import {
  setTransitionActive,
  TRANSITION_MIN_VISIBLE_MS,
  TRANSITION_OVERLAY_CLASS,
  transitionVisible,
} from "@/components/transition-loader";

// Every page change must show the loader, so the rules are pinned: never hide while a load
// is running, and always stay visible for the minimum window after the page changed.
describe("transition loader visibility", () => {
  it("is visible right after a page change", () => {
    expect(transitionVisible({ stillLoading: false, sinceChangeMs: 0 })).toBe(true);
  });

  it("stays visible for the whole minimum window", () => {
    expect(
      transitionVisible({ stillLoading: false, sinceChangeMs: TRANSITION_MIN_VISIBLE_MS - 1 }),
    ).toBe(true);
  });

  it("hides once the window has passed and nothing is loading", () => {
    expect(
      transitionVisible({ stillLoading: false, sinceChangeMs: TRANSITION_MIN_VISIBLE_MS }),
    ).toBe(false);
  });

  it("keeps showing while the next page is still loading", () => {
    expect(
      transitionVisible({ stillLoading: true, sinceChangeMs: TRANSITION_MIN_VISIBLE_MS * 5 }),
    ).toBe(true);
  });
});

// A translucent overlay let the route pending screen show through, so one transition looked like
// two loaders stacked; the overlay must stay opaque.
describe("transition overlay chrome", () => {
  it("paints an opaque background", () => {
    expect(TRANSITION_OVERLAY_CLASS).toContain("bg-background");
    expect(TRANSITION_OVERLAY_CLASS).not.toContain("bg-background/");
  });

  it("stays inert so it never swallows taps", () => {
    expect(TRANSITION_OVERLAY_CLASS).toContain("pointer-events-none");
  });
});

describe("transition active flag", () => {
  it("marks and clears the document so the pending screen stays hidden", () => {
    const root = document.createElement("div");
    setTransitionActive(true, root);
    expect(root.dataset["routeTransition"]).toBe("1");
    setTransitionActive(false, root);
    expect(root.dataset["routeTransition"]).toBeUndefined();
  });

  it("does nothing without a document (server render)", () => {
    expect(() => setTransitionActive(true, null)).not.toThrow();
  });
});
