import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getBetterAuthSession } from "@/lib/better-auth-client";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";

vi.mock("@/lib/better-auth-client", () => ({ getBetterAuthSession: vi.fn() }));

const mocked = vi.mocked(getBetterAuthSession);

afterEach(() => {
  vi.clearAllMocks();
});

describe("useBetterAuthUser", () => {
  it("starts in a loading state so signed-out UI cannot flash", () => {
    mocked.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useBetterAuthUser());
    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
  });

  it("exposes the authenticated customer", async () => {
    mocked.mockResolvedValue({
      user: { id: "u1", name: "Fakhri", email: "fakhri@example.com" },
      session: { id: "s1", expiresAt: "2026-10-17T00:00:00.000Z" },
    });
    const { result } = renderHook(() => useBetterAuthUser());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.email).toBe("fakhri@example.com");
  });

  it("settles to signed out when there is no session", async () => {
    mocked.mockResolvedValue(null);
    const { result } = renderHook(() => useBetterAuthUser());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("settles to signed out when the session request fails", async () => {
    mocked.mockRejectedValue(new Error("network down"));
    const { result } = renderHook(() => useBetterAuthUser());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });
});
