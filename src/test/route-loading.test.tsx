import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoutePendingScreen, SkeletonCards } from "@/components/route-loading";
import { PROGRESS_MIN_VISIBLE_MS, PROGRESS_SHOW_DELAY_MS, progressPhase } from "@/components/nav-progress";

afterEach(cleanup);

describe("route pending screen", () => {
  it("renders a labelled, busy pending screen with placeholder cards", () => {
    render(<RoutePendingScreen />);
    const pending = screen.getByTestId("route-pending");
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Memuat data…")).toBeInTheDocument();
    expect(screen.getAllByTestId("pending-card")).toHaveLength(6);
  });

  it("takes a custom label and card count", () => {
    render(<RoutePendingScreen label="Memuat paket internet…" count={2} />);
    expect(screen.getByText("Memuat paket internet…")).toBeInTheDocument();
    expect(screen.getAllByTestId("pending-card")).toHaveLength(2);
  });

  it("keeps rendering when the user prefers reduced motion", () => {
    vi.stubGlobal(
      "matchMedia",
      (query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    );
    render(<SkeletonCards count={3} />);
    expect(screen.getAllByTestId("pending-card")).toHaveLength(3);
    vi.unstubAllGlobals();
  });
});

describe("nav progress phase", () => {
  it("stays hidden while a fast navigation is still under way", () => {
    expect(
      progressPhase({ stillPending: true, pendingForMs: PROGRESS_SHOW_DELAY_MS - 10, visibleForMs: -1 }),
    ).toBe("hidden");
  });

  it("shows once the pending phase outlives the delay", () => {
    expect(progressPhase({ stillPending: true, pendingForMs: PROGRESS_SHOW_DELAY_MS, visibleForMs: 0 })).toBe("showing");
  });

  it("finishes for the minimum visible window after the load ends", () => {
    expect(
      progressPhase({ stillPending: false, pendingForMs: 900, visibleForMs: PROGRESS_MIN_VISIBLE_MS - 1 }),
    ).toBe("finishing");
    expect(progressPhase({ stillPending: false, pendingForMs: 900, visibleForMs: PROGRESS_MIN_VISIBLE_MS })).toBe("hidden");
  });

  it("never appears for a load that finished before the delay", () => {
    expect(progressPhase({ stillPending: false, pendingForMs: 40, visibleForMs: -1 })).toBe("hidden");
  });
});
