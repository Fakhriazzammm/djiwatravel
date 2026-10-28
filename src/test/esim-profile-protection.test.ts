import { describe, expect, it, beforeEach } from "vitest";
import { decryptEsimSecret } from "@/lib/esim-secret-crypto";
import { protectProviderProfile } from "@/lib/esim-profile-protection";

describe("provider eSIM profile protection", () => {
  beforeEach(() => {
    process.env["ESIM_PROFILE_ENCRYPTION_KEY"] =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });
  it("encrypts activation and QR payload before repository persistence", () => {
    const profile = protectProviderProfile("order-1", {
      obj: {
        esimProfile: {
          iccid: "898821234",
          smdpAddress: "smdp.example",
          activationCode: "secret-code",
          status: "ENABLED",
        },
      },
    });
    expect(profile.iccid).toBe("898821234");
    expect(profile.status).toBe("ENABLED");
    expect(profile.activationCodeEncrypted).not.toContain("secret-code");
    expect(decryptEsimSecret(profile.activationCodeEncrypted!)).toBe("secret-code");
    expect(decryptEsimSecret(profile.qrPayloadEncrypted!)).toBe("LPA:1$smdp.example$secret-code");
  });
  it("fails closed when ICCID is absent", () => {
    expect(() =>
      protectProviderProfile("order-1", { obj: { esimProfile: { activationCode: "x" } } }),
    ).toThrow("ICCID");
  });

  it("preserves provider lifecycle identifiers without returning plaintext secrets", () => {
    const profile = protectProviderProfile("order-1", {
      obj: {
        esimProfile: {
          iccid: "898821235",
          esimTranNo: "tran-123",
          smdpAddress: "smdp.example",
          activationCode: "secret-code-2",
          esimStatus: "IN_USE",
          expiredTime: "2027-04-10T10:58:23+0000",
        },
      },
    });

    expect(profile.esimTranNo).toBe("tran-123");
    expect(profile.smdpAddress).toBe("smdp.example");
    expect(profile.status).toBe("IN_USE");
    expect(profile.expiresAt).toBe("2027-04-10T10:58:23.000Z");
    expect(JSON.stringify(profile)).not.toContain("secret-code-2");
  });
});
