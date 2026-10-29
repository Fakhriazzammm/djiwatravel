import { afterEach, describe, expect, it, vi } from "vitest";
import { createDjiwaPayBridgeUrl, DjiwaPayBridgeError } from "@/lib/djiwa-pay-bridge.server";

afterEach(() => vi.restoreAllMocks());

describe("Djiwa Pay auth bridge", () => {
  it("requires the Travel session cookie", async () => {
    await expect(
      createDjiwaPayBridgeUrl(new Request("https://djiwatravel.com/api/djiwa-pay/bridge")),
    ).rejects.toMatchObject({ message: "Autentikasi diperlukan", status: 401 });
  });

  it("forwards the Travel cookie and returns only an allowed Pay redirect", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: {
          location: "https://djiwapay.web.id/?bridgeToken=one-time-token",
        },
      }),
    );

    const result = await createDjiwaPayBridgeUrl(
      new Request("https://djiwatravel.com/api/djiwa-pay/bridge", {
        headers: { cookie: "better-auth.session_token=session" },
      }),
    );

    expect(result).toBe("https://djiwapay.web.id/?bridgeToken=one-time-token");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/customer/pay-bridge/start?returnTo="),
      expect.objectContaining({
        redirect: "manual",
        headers: expect.objectContaining({
          cookie: "better-auth.session_token=session",
          origin: "https://djiwatravel.com",
        }),
      }),
    );
  });

  it("rejects a redirect outside the Djiwa Pay origins", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://example.com/?bridgeToken=stolen" },
      }),
    );

    await expect(
      createDjiwaPayBridgeUrl(
        new Request("https://djiwatravel.com/api/djiwa-pay/bridge", {
          headers: { cookie: "session=present" },
        }),
      ),
    ).rejects.toBeInstanceOf(DjiwaPayBridgeError);
  });
});
