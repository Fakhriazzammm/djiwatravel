import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarConnectBanner } from "@/components/calendar-connect-banner";
import { CALENDAR_RETURN_COOKIE, isSafeCalendarReturn, readCookie } from "@/lib/calendar-return";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function mockStatus(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => body })),
  );
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/my-trips/abc/itinerary");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Google Calendar prompt on the Agenda", () => {
  it("invites travelers who have not connected, and returns to this page afterwards", async () => {
    mockStatus({ connected: false, configured: true });
    render(<CalendarConnectBanner />);
    const link = await screen.findByRole("link", { name: "Hubungkan" });
    expect(link).toHaveAttribute(
      "href",
      "/api/google-calendar/connect?returnTo=%2Fmy-trips%2Fabc%2Fitinerary",
    );
  });

  it("stays hidden when already connected, not configured, or the status is unavailable", async () => {
    for (const [body, ok] of [
      [{ connected: true, configured: true }, true],
      [{ connected: false, configured: false }, true],
      [{ error: "x" }, false],
    ] as const) {
      mockStatus(body, ok);
      const { unmount } = render(<CalendarConnectBanner />);
      await new Promise((r) => setTimeout(r, 20));
      expect(screen.queryByTestId("calendar-connect-banner")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("can be dismissed and then stays away for a while", async () => {
    mockStatus({ connected: false, configured: true });
    const first = render(<CalendarConnectBanner />);
    fireEvent.click(await screen.findByRole("button", { name: "Tutup" }));
    await waitFor(() =>
      expect(screen.queryByTestId("calendar-connect-banner")).not.toBeInTheDocument(),
    );
    first.unmount();
    mockStatus({ connected: false, configured: true });
    render(<CalendarConnectBanner />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("calendar-connect-banner")).not.toBeInTheDocument();
  });
});

describe("calendar return path", () => {
  it("only returns to trip pages on this site", () => {
    expect(isSafeCalendarReturn("/my-trips/abc/itinerary")).toBe(true);
    for (const bad of [
      "//evil.com",
      "https://evil.com",
      "/profile",
      "/my-trips/../x\\evil",
      null,
      42,
    ]) {
      expect(isSafeCalendarReturn(bad)).toBe(false);
    }
  });
  it("reads the return cookie", () => {
    const header = `a=1; ${CALENDAR_RETURN_COOKIE}=${encodeURIComponent("/my-trips/abc/itinerary")}; b=2`;
    expect(readCookie(header, CALENDAR_RETURN_COOKIE)).toBe("/my-trips/abc/itinerary");
    expect(readCookie(null, CALENDAR_RETURN_COOKIE)).toBeNull();
  });
});
