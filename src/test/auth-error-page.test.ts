import { describe, expect, it } from "vitest";
import { renderAuthErrorPage } from "@/lib/error-page";

describe("renderAuthErrorPage", () => {
  it("explains a stale state error and offers a fresh sign-in", () => {
    const html = renderAuthErrorPage("state_mismatch");
    expect(html).toContain("state_mismatch");
    expect(html).toContain("Mulai login lagi");
    expect(html).toContain("/api/auth/sign-in/social");
    expect(html).toContain('"google"');
  });

  it("keeps the one-click retry for other error codes", () => {
    const html = renderAuthErrorPage();
    expect(html).toContain("unknown_error");
    expect(html).toContain("/api/auth/sign-in/social");
  });

  it("does not render the raw upstream provider error page", () => {
    const html = renderAuthErrorPage("state_security_mismatch");
    expect(html).not.toContain("better-auth.com");
    expect(html).toContain("state_security_mismatch");
  });
});
