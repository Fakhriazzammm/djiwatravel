import { describe, expect, it } from "vitest";
import { customerProfileInputSchema } from "@/lib/customer-profile.server";

describe("customer profile server contract", () => {
  it("accepts legacy contact-only profiles and optional traveler data", () => {
    expect(
      customerProfileInputSchema.parse({
        email: "traveler@example.com",
        whatsapp: "6281234567890",
        displayName: "Rani Putri",
        nationality: "Indonesia",
        dateOfBirth: "1995-04-12",
        gender: "female",
      }),
    ).toMatchObject({ displayName: "Rani Putri", gender: "female" });
    expect(
      customerProfileInputSchema.parse({
        email: "traveler@example.com",
        whatsapp: "6281234567890",
      }),
    ).toMatchObject({ email: "traveler@example.com" });
  });

  it("rejects invalid traveler data at the server boundary", () => {
    expect(() =>
      customerProfileInputSchema.parse({
        email: "traveler@example.com",
        whatsapp: "6281234567890",
        dateOfBirth: "2999-01-01",
        gender: "other",
      }),
    ).toThrow();
  });
});
