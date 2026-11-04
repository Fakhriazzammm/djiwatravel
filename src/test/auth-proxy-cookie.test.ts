import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/api.auth.$";

afterEach(() => vi.unstubAllGlobals());

describe("auth proxy session cookie", () => {
  it("re-issues the app-root session cookie as persistent, not session-only", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response('{"user":null}', { headers: { "content-type": "application/json" } }),
      ),
    );
    const handlers = (
      Route.options as unknown as {
        server: { handlers: { GET: (c: { request: Request }) => Promise<Response> } };
      }
    ).server.handlers;
    const response = await handlers.GET({
      request: new Request("https://djiwatravel.com/api/auth/get-session", {
        headers: { cookie: "__Secure-better-auth.session_token=abc.def" },
      }),
    });
    const cookie = response.headers.getSetCookie().find((c) => c.includes("session_token"));
    expect(cookie).toContain("Max-Age=604800");
    expect(cookie).toContain("Path=/");
  });
});
