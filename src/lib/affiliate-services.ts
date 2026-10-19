export type AffiliateService = {
  id: string;
  partnerName: string;
  productTitle: string;
  destinationCode: string;
  categoryId: string;
  image?: string;
  affiliateUrl: string;
  status: "ACTIVE" | "COMING_SOON" | "DISABLED";
  displayOrder: number;
};

/** Keep this list explicit; adding a partner requires deliberate review. */
export const approvedAffiliateHosts: readonly string[] = [];

export function isApprovedAffiliateUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && approvedAffiliateHosts.includes(url.hostname);
  } catch {
    return false;
  }
}

export function activeAffiliateServices(items: readonly AffiliateService[]): AffiliateService[] {
  return items
    .filter((item) => item.status === "ACTIVE" && isApprovedAffiliateUrl(item.affiliateUrl))
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

// Intentionally empty until an affiliate partnership and URL are approved.
export const affiliateServices: readonly AffiliateService[] = [];
