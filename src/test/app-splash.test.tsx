import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppSplash } from "@/components/app-splash";

// The splash is what keeps a cold load from showing an empty white page, so these tests
// pin both halves: it renders on the server pass and it goes away by itself afterwards.
describe("AppSplash", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reduced motion keeps the exit instant, which is what makes this assertion
    // deterministic in jsdom (motion otherwise waits on an animation frame).
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the brand splash immediately", () => {
    render(<AppSplash />);
    expect(screen.getByTestId("app-splash")).toBeTruthy();
    expect(screen.getByText(/Menyiapkan Djiwa Travel/)).toBeTruthy();
  });

  it("hides itself after the mount window", async () => {
    render(<AppSplash />);
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.queryByTestId("app-splash")).toBeNull();
  });
});
