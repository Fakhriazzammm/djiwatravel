import { describe, expect, it } from "vitest";
import { canonicalRedirectUrl, CANONICAL_HOST } from "@/lib/canonical-host";

describe("canonicalRedirectUrl", () => {
  it("redirects the www alias to the canonical host, keeping path and query", () => {
    expect(canonicalRedirectUrl("https://www.djiwatravel.com/profile?tab=orders")).toBe(
      `https://${CANONICAL_HOST}/profile?tab=orders`,
    );
  });

  it("redirects the auth proxy paths too, so no session starts on the alias", () => {
    expect(canonicalRedirectUrl("https://www.djiwatravel.com/api/auth/get-session")).toBe(
      `https://${CANONICAL_HOST}/api/auth/get-session`,
    );
  });

  it("never redirects the canonical host", () => {
    expect(canonicalRedirectUrl("https://djiwatravel.com/profile")).toBeNull();
    expect(canonicalRedirectUrl("https://djiwatravel.com/")).toBeNull();
  });

  it("ignores unrelated and lookalike hosts", () => {
    expect(canonicalRedirectUrl("https://notwww.djiwatravel.com/x")).toBeNull();
    expect(canonicalRedirectUrl("https://www.djiwatravel.com.evil.example/x")).toBeNull();
    expect(canonicalRedirectUrl("http://localhost:4180/")).toBeNull();
  });

  it("handles unparsable input without throwing", () => {
    expect(canonicalRedirectUrl("not a url")).toBeNull();
  });
});
