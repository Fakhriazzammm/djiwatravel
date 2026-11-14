import { afterEach, describe, expect, it, vi } from "vitest";
import { authenticateCustomerCookie } from "@/lib/customer-session.server";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("customer session auth failures", () => {
  it("distinguishes auth service outages from signed-out sessions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket closed")));

    await expect(authenticateCustomerCookie("better-auth.session=example")).rejects.toMatchObject({
      name: "CustomerSessionUnavailableError",
    });
  });
});
