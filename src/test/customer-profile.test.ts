import { describe, expect, it } from "vitest";

import {
  isCustomerProfileComplete,
  normalizeCustomerProfile,
  validateCustomerProfile,
} from "@/lib/customer-profile";

describe("customer profile format validation", () => {
  it("accepts a normal email and WhatsApp number", () => {
    expect(
      isCustomerProfileComplete({ email: "traveler@example.com", whatsapp: "6281234567890" }),
    ).toBe(true);
  });

  it("accepts the local 08… form too, because it is normalised before validation", () => {
    expect(
      isCustomerProfileComplete({ email: "traveler@example.com", whatsapp: "081234567890" }),
    ).toBe(true);
  });

  it("rejects malformed contact values without checking ownership", () => {
    expect(validateCustomerProfile({ email: "traveler", whatsapp: "123" })).toEqual({
      email: "Masukkan email yang valid.",
      whatsapp: "Nomor WhatsApp belum valid. Contoh: 08123456789.",
    });
  });

  it("rejects numbers that cannot become a dialable 62… number", () => {
    expect(validateCustomerProfile({ email: "traveler@example.com", whatsapp: "0812" })).toEqual({
      whatsapp: "Nomor WhatsApp belum valid. Contoh: 08123456789.",
    });
    expect(
      validateCustomerProfile({ email: "traveler@example.com", whatsapp: "abcdefghij" }),
    ).toEqual({ whatsapp: "Nomor WhatsApp belum valid. Contoh: 08123456789." });
  });

  it("stores the international form regardless of how it was typed", () => {
    expect(
      normalizeCustomerProfile({ email: " traveler@example.com ", whatsapp: "0812 3456 789" }),
    ).toEqual({
      email: "traveler@example.com",
      whatsapp: "628123456789",
    });
  });
});
