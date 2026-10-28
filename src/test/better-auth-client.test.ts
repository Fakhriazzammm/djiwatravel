import { afterEach, describe, expect, it, vi } from "vitest";
import { getBetterAuthSession, signInEmail, signUpEmail } from "@/lib/better-auth-client";
afterEach(() => vi.unstubAllGlobals());
describe("Better Auth email requests", () => {
  it("uses the configured auth base, POST bodies, and cookie credentials", async () => {
    vi.stubGlobal("window", { location: { hostname: "djiwatravel.com" } });
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetch);
    await signInEmail("a@example.com", "password");
    await signUpEmail("Traveler", "a@example.com", "password");
    await getBetterAuthSession();
    const base = "/api/auth";
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      `${base}/sign-in/email`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ email: "a@example.com", password: "password" }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${base}/sign-up/email`,
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ name: "Traveler", email: "a@example.com", password: "password" }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      `${base}/get-session`,
      expect.objectContaining({ credentials: "include" }),
    );
    expect(fetch.mock.calls[2]?.[1]?.method).toBeUndefined();
  });

  it("uses the local demo session without contacting auth on localhost", async () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(getBetterAuthSession()).resolves.toMatchObject({
      user: { id: "local-demo-user", email: "local@djiwatravel.test" },
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
