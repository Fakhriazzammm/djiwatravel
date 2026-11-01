import { readFileSync } from "node:fs";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUnreadNotifications } from "../hooks/use-unread-notifications";

afterEach(() => vi.unstubAllGlobals());

describe("useUnreadNotifications", () => {
  it("does not call the API for signed-out visitors", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useUnreadNotifications(false));
    expect(result.current).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads unread_count for signed-in customers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ unread_count: 3 }) }),
    );
    const { result } = renderHook(() => useUnreadNotifications(true));
    await waitFor(() => expect(result.current).toBe(3));
  });

  it("falls back to 0 when the API fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { result } = renderHook(() => useUnreadNotifications(true));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBe(0);
  });
});

describe("Home header bell", () => {
  it("links signed-in customers to /notifications", () => {
    const home = readFileSync("src/routes/index.tsx", "utf8");
    expect(home).toContain('to="/notifications"');
    expect(home).toContain("useUnreadNotifications(Boolean(user))");
  });
});
