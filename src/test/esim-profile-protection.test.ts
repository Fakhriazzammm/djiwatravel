import { describe, expect, it, beforeEach } from "vitest";
import { decryptEsimSecret } from "@/lib/esim-secret-crypto";
import { protectProviderProfile } from "@/lib/esim-profile-protection";

describe("provider eSIM profile protection", () => {
  beforeEach(() => { process.env["ESIM_PROFILE_ENCRYPTION_KEY"] = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; });
  it("encrypts activation and QR payload before repository persistence", () => {
    const profile = protectProviderProfile("order-1", { obj: { esimProfile: { iccid: "898821234", smdpAddress: "smdp.example", activationCode: "secret-code", status: "ENABLED" } } });
    expect(profile.iccid).toBe("898821234");
    expect(profile.status).toBe("ENABLED");
    expect(profile.activationCodeEncrypted).not.toContain("secret-code");
    expect(decryptEsimSecret(profile.activationCodeEncrypted!)).toBe("secret-code");
    expect(decryptEsimSecret(profile.qrPayloadEncrypted!)).toBe("LPA:1$smdp.example$secret-code");
  });
  it("fails closed when ICCID is absent", () => {
    expect(() => protectProviderProfile("order-1", { obj: { esimProfile: { activationCode: "x" } } })).toThrow("ICCID");
  });
});
