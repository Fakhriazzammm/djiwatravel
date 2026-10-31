import { describe, expect, it, vi } from "vitest";
import { resolveOptionalCustomerSession } from "../lib/guest-session";

describe("optional customer session resolution", () => {
  it("allows checkout as a guest when the request has no Better Auth session cookie", async () => {
    const verify = vi.fn(async () => ({ id: "member-1" }));

    await expect(resolveOptionalCustomerSession("consent=yes; analytics=on", verify)).resolves.toBe(
      null,
    );
    expect(verify).not.toHaveBeenCalled();
  });

  it("does not downgrade a present but unverifiable session to a guest", async () => {
    const verify = vi.fn(async () => {
      throw new Error("Autentikasi diperlukan");
    });

    await expect(
      resolveOptionalCustomerSession("better-auth.session_token=opaque-token", verify),
    ).rejects.toThrow("Autentikasi diperlukan");
    expect(verify).toHaveBeenCalledWith("better-auth.session_token=opaque-token");
  });

  it("returns the verified session owner for a valid session cookie", async () => {
    const user = { id: "verified-member-1", email: "member@example.com" };
    const verify = vi.fn(async () => user);

    await expect(
      resolveOptionalCustomerSession("__Secure-better-auth.session_token=opaque-token", verify),
    ).resolves.toEqual(user);
  });
});
