import { describe, expect, it } from "vitest";
import { hashGuestAccessToken, normalizeGuestWhatsapp } from "../lib/guest-order-access.server";

describe("hashGuestAccessToken", () => {
  it("returns a stable SHA-256 digest rather than the bearer token", () => {
    const first = hashGuestAccessToken("guest-token-example-32-characters");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(hashGuestAccessToken("guest-token-example-32-characters"));
    expect(first).not.toBe("guest-token-example-32-characters");
  });
});

describe("normalizeGuestWhatsapp", () => {
  it("strips formatting and preserves only digits", () => {
    expect(normalizeGuestWhatsapp("+62 812-3456 7890")).toBe("6281234567890");
  });

  it("rejects normalized numbers outside the supported digit length", () => {
    expect(() => normalizeGuestWhatsapp("123-45678")).toThrow("Nomor WhatsApp tidak valid");
    expect(() => normalizeGuestWhatsapp("1234567890123456")).toThrow("Nomor WhatsApp tidak valid");
  });
});
