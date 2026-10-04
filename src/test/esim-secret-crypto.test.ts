import { describe, expect, it, beforeEach } from "vitest";
import { decryptEsimSecret, encryptEsimSecret, fingerprintEsimSecret } from "@/lib/esim-secret-crypto";

describe("eSIM secret encryption", () => {
  beforeEach(() => { process.env.ESIM_PROFILE_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; });
  it("round-trips and uses authenticated ciphertext", () => {
    const a = encryptEsimSecret("LPA:1$sm-dp.example$activation");
    const b = encryptEsimSecret("LPA:1$sm-dp.example$activation");
    expect(a).not.toBe(b);
    expect(decryptEsimSecret(a)).toBe("LPA:1$sm-dp.example$activation");
    expect(() => decryptEsimSecret(a.slice(0, -1) + (a.endsWith("A") ? "B" : "A"))).toThrow();
  });
  it("fingerprint is deterministic without revealing plaintext", () => {
    expect(fingerprintEsimSecret("activation")).toBe(fingerprintEsimSecret("activation"));
    expect(fingerprintEsimSecret("activation")).not.toContain("activation");
  });
});
