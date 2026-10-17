import { describe, expect, it } from "vitest";
import { isBetterAuthUserId, normalizeCustomerWhatsapp } from "@/lib/customer-profile.server";

describe("customer profile input contract", () => {
  it("accepts an Indonesian WhatsApp number in the canonical 62 format", () => {
    expect(normalizeCustomerWhatsapp("628123456789")).toBe("628123456789");
  });

  it("rejects numbers that do not start with the 62 country code", () => {
    expect(() => normalizeCustomerWhatsapp("081234567890")).toThrow("Nomor WhatsApp");
    expect(() => normalizeCustomerWhatsapp("+62 812-3456-789")).toThrow("Nomor WhatsApp");
    expect(() => normalizeCustomerWhatsapp("1234")).toThrow("Nomor WhatsApp");
  });

  it("rejects numbers outside the 9-15 digit national length", () => {
    expect(() => normalizeCustomerWhatsapp("628")).toThrow("Nomor WhatsApp");
    expect(() => normalizeCustomerWhatsapp("62" + "1".repeat(14))).toThrow("Nomor WhatsApp");
  });

  it("accepts the Better Auth opaque text user id shape", () => {
    // Real id sampled from the live better-auth "user" table (text, 32 chars).
    expect(isBetterAuthUserId("Ge9VSn4aTDJ9ZFJaqj2U5r2GQ5WPNC12")).toBe(true);
    expect(isBetterAuthUserId("a".repeat(16))).toBe(true);
  });

  it("rejects ids that cannot come from a Better Auth session", () => {
    expect(isBetterAuthUserId("")).toBe(false);
    expect(isBetterAuthUserId("short")).toBe(false);
    expect(isBetterAuthUserId("has spaces and is long enough")).toBe(false);
    expect(isBetterAuthUserId(undefined)).toBe(false);
    expect(isBetterAuthUserId(null)).toBe(false);
    expect(isBetterAuthUserId(12345)).toBe(false);
  });
});
