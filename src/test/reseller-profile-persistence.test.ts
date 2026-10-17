import { beforeEach, describe, expect, it } from "vitest";
import { persistProviderProfile } from "@/lib/reseller-profile-persistence";
import { InMemoryResellerRepository } from "@/lib/reseller-repository";

describe("profile persistence", () => {
  beforeEach(() => {
    process.env["ESIM_PROFILE_ENCRYPTION_KEY"] =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  });
  it("returns safe metadata while saving encrypted profile data", async () => {
    const repo = new InMemoryResellerRepository();
    const result = await persistProviderProfile(repo, "o1", {
      obj: { profile: { iccid: "8988", activationCode: "secret", smdp: "smdp.example" } },
    });
    expect(result).toEqual({ orderId: "o1", iccid: "8988", status: "RELEASED" });
    expect(result).not.toHaveProperty("activationCode");
  });
});
