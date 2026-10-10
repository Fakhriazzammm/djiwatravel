import { describe, expect, it } from "vitest";
import { isCustomerProfileComplete, validateCustomerProfile } from "@/lib/customer-profile";

describe("customer profile format validation", () => {
  it("accepts a normal email and WhatsApp number", () => {
    expect(isCustomerProfileComplete({ email: "traveler@example.com", whatsapp: "6281234567890" })).toBe(true);
  });

  it("rejects malformed contact values without checking ownership", () => {
    expect(validateCustomerProfile({ email: "traveler", whatsapp: "123" })).toEqual({
      email: "Masukkan email yang valid.",
      whatsapp: "Masukkan nomor WhatsApp yang valid.",
    });
  });

  it("rejects WhatsApp numbers without the 62 prefix", () => {
    expect(validateCustomerProfile({ email: "traveler@example.com", whatsapp: "081234567890" })).toEqual({
      whatsapp: "Masukkan nomor WhatsApp yang valid.",
    });
  });
});
