import { describe, expect, it } from "vitest";
import {
  buildProviderRequest,
  buildWebhookUrl,
  formatRegistrationResult,
} from "../../scripts/register-esim-access-webhook.mjs";

describe("eSIM Access webhook registration", () => {
  it("builds the public endpoint from the configured base URL and token", () => {
    expect(
      buildWebhookUrl({
        publicBaseUrl: "https://djiwatravel.com/",
        webhookToken: "token-123",
      }),
    ).toBe("https://djiwatravel.com/api/webhooks/esim-access/token-123");
  });

  it("signs the exact JSON request body with provider headers", () => {
    const request = buildProviderRequest({
      accessCode: "access",
      secretKey: "secret",
      requestId: "request-1",
      timestamp: "1700000000000",
      path: "/api/v1/open/webhook/save",
      body: { webhook: "https://example.test/hook" },
    });
    expect(request.body).toBe('{"webhook":"https://example.test/hook"}');
    expect(request.headers["RT-AccessCode"]).toBe("access");
    expect(request.headers["RT-RequestID"]).toBe("request-1");
    expect(request.headers["RT-Timestamp"]).toBe("1700000000000");
    expect(request.headers["RT-Signature"]).toBe(
      "255a3b91c21909482dd819effe0d79f61c0325837208f52e2fb5e2b0e17b9c10",
    );
  });

  it("formats only redacted registration output", () => {
    const output = formatRegistrationResult({
      webhookUrl: "https://example.test/hook/public-token",
      configuredWebhookUrl: "https://example.test/hook/public-token",
    });
    expect(output).toContain("verified=true");
    expect(output).toContain("public-token");
    expect(output).not.toContain("secret");
    expect(output).not.toContain("access");
  });
});
