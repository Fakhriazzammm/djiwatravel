import { describe, expect, it } from "vitest";
import { isValidWebhookToken, resolveWebhookToken } from "@/lib/esim-access-webhook-auth";

describe("eSIM Access webhook authentication", () => {
  it("uses the dedicated public webhook token instead of the provider secret", () => {
    expect(resolveWebhookToken({ ESIM_ACCESS_WEBHOOK_TOKEN: "public-token" })).toBe("public-token");
    expect(resolveWebhookToken({ ESIM_ACCESS_SECRET_KEY: "provider-secret" })).toBeNull();
  });

  it("compares tokens without accepting a near match", () => {
    expect(isValidWebhookToken("public-token", "public-token")).toBe(true);
    expect(isValidWebhookToken("public-token-x", "public-token")).toBe(false);
    expect(isValidWebhookToken("", "public-token")).toBe(false);
  });
});
