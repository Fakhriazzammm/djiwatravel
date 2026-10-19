import { describe, expect, it } from "vitest";
import { activeAffiliateServices, isApprovedAffiliateUrl } from "../lib/affiliate-services";

describe("affiliate service safety", () => {
  it("rejects unapproved and non-https URLs", () => {
    expect(isApprovedAffiliateUrl("https://example.com/item")).toBe(false);
    expect(isApprovedAffiliateUrl("http://example.com/item")).toBe(false);
    expect(isApprovedAffiliateUrl("not-a-url")).toBe(false);
  });

  it("does not render an active partner without an approved host", () => {
    const items = [
      {
        id: "x",
        partnerName: "Example",
        productTitle: "Trip",
        destinationCode: "JP",
        categoryId: "attractions",
        affiliateUrl: "https://example.com/trip",
        status: "ACTIVE" as const,
        displayOrder: 1,
      },
    ];
    expect(activeAffiliateServices(items)).toEqual([]);
  });
});
