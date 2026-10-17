import { describe, expect, it, beforeEach } from "vitest";
import { issueCustomerSession, verifyCustomerSession } from "@/lib/customer-auth";

describe("customer auth session", () => {
  beforeEach(() => {
    process.env["CUSTOMER_AUTH_SECRET"] = "test-secret-that-is-longer-than-32-characters";
  });
  it("issues and verifies a short-lived session", () => {
    const token = issueCustomerSession({
      customerId: "cust-1",
      email: "user@example.com",
      ttlSeconds: 60,
    });
    expect(verifyCustomerSession(token, 1000000000).sub).toBe("cust-1");
  });
  it("rejects tampering and expiry", () => {
    const token = issueCustomerSession({ customerId: "cust-1", ttlSeconds: 60 });
    expect(() => verifyCustomerSession(token.slice(0, -1) + "x")).toThrow();
    expect(() => verifyCustomerSession(token, Math.floor(Date.now() / 1000) + 61)).toThrow(
      "kedaluwarsa",
    );
  });
});
