export const SEO_BASE_URL = "https://djiwatravel.com";

export type JsonLd = Record<string, unknown>;

export function jsonLdScript(value: JsonLd | JsonLd[]) {
  return {
    type: "application/ld+json" as const,
    children: JSON.stringify(value),
  };
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function productJsonLd(input: {
  name: string;
  description: string;
  sku: string;
  url: string;
  priceIdr: number;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    sku: input.sku,
    brand: { "@type": "Brand", name: "Djiwa Travel" },
    offers: {
      "@type": "Offer",
      url: input.url,
      priceCurrency: "IDR",
      price: input.priceIdr,
      availability: "https://schema.org/InStock",
    },
  };
}

export function organizationJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Djiwa Travel",
    url: `${SEO_BASE_URL}/`,
    logo: `${SEO_BASE_URL}/icon-512.png`,
  };
}

export function websiteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Djiwa Travel",
    url: `${SEO_BASE_URL}/`,
    inLanguage: "id-ID",
  };
}
