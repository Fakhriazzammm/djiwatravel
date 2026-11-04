import { describe, expect, it } from "vitest";
import { buildPreorderEmail, escapeEmailHtml, preorderEmailCopy } from "@/lib/esim-preorder-email";

describe("preorder transactional email", () => {
  it("escapes customer-controlled values in HTML", () => {
    expect(escapeEmailHtml(`<img src=x onerror='alert(1)'>&`)).toBe(
      "&lt;img src=x onerror=&#39;alert(1)&#39;&gt;&amp;",
    );
  });

  it("includes a recovery-safe guest link and order code without an access bearer token", () => {
    const email = buildPreorderEmail({
      state: "awaiting_balance",
      publicOrderCode: "ABCD-1234",
      href: "https://djiwatravel.com/order-status",
    });
    expect(email.subject).toContain("Pre-order");
    expect(email.text).toContain("ABCD-1234");
    expect(email.text).toContain("/order-status");
    expect(email.html).not.toContain("accessToken");
    expect(email.html).toContain("https://djiwatravel.com/order-status");
  });

  it("explains admin review instead of promising an automatic purchase after the deadline", () => {
    const copy = preorderEmailCopy("refund_review");
    expect(copy.message).toContain("antrean Admin");
    expect(copy.message).not.toContain("otomatis");
  });
});
