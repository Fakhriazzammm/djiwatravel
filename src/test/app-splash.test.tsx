import { render, screen, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppSplash } from "@/components/app-splash";

// A splash that fails to clear covers the whole app and swallows taps, so these tests pin
// both halves: it is there on the first paint, and it is hidden and inert once mounted.
describe("AppSplash", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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

  it("renders the brand splash on the first paint", () => {
    render(<AppSplash />);
    const splash = screen.getByTestId("app-splash");
    expect(splash.style.visibility).toBe("visible");
    expect(screen.getByText(/Menyiapkan Djiwa Travel/)).toBeTruthy();
  });

  it("hides itself after the mount window", async () => {
    render(<AppSplash />);
    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.queryByTestId("app-splash")).not.toBeInTheDocument();
  });

  it("never swallows taps, even while visible", () => {
    render(<AppSplash />);
    expect(screen.getByTestId("app-splash").className).toContain("pointer-events-none");
  });
});
