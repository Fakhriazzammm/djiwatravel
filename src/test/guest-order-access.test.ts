import { describe, expect, it } from "vitest";
import {
  GUEST_ACCESS_TTL_MS,
  hashGuestAccessToken,
  isGuestAccessExpired,
  normalizeGuestWhatsapp,
  SUPPORT_WHATSAPP_URL,
} from "../lib/guest-order-access.server";
import { hasGuestOrderAccess } from "../lib/orders";

describe("hashGuestAccessToken", () => {
  it("returns a stable SHA-256 digest rather than the bearer token", () => {
    const first = hashGuestAccessToken("guest-token-example-32-characters");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(hashGuestAccessToken("guest-token-example-32-characters"));
    expect(first).not.toBe("guest-token-example-32-characters");
  });
});

describe("guest order authorization boundary", () => {
  it("does not authorize a bare UUID without a locally held guest token", () => {
    localStorage.removeItem("djiwa.guest-order-access");
    expect(hasGuestOrderAccess("00000000-0000-4000-8000-000000000000")).toBe(false);
  });
});

describe("support URL", () => {
  it("uses the validated official WhatsApp number", () => {
    expect(SUPPORT_WHATSAPP_URL).toBe("https://wa.me/6285156399831");
  });
});

describe("guest access expiry", () => {
  it("expires exactly one hour after issuance and remains valid before the boundary", () => {
    const issuedAt = Date.parse("2026-01-01T00:00:00.000Z");
    const expiresAt = new Date(issuedAt + GUEST_ACCESS_TTL_MS);
    expect(isGuestAccessExpired(expiresAt, issuedAt + GUEST_ACCESS_TTL_MS - 1)).toBe(false);
    expect(isGuestAccessExpired(expiresAt, issuedAt + GUEST_ACCESS_TTL_MS)).toBe(true);
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
