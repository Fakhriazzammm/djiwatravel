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
  available?: boolean;
  image?: string;
  /** ISO date until which the price is stated valid; defaults to 7 days (catalogue is live). */
  priceValidUntil?: string;
  durationDays?: number;
  dataLabel?: string;
  coverage?: string;
}): JsonLd {
  const validUntil =
    input.priceValidUntil ?? new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const props = [
    input.dataLabel && { "@type": "PropertyValue", name: "Kuota data", value: input.dataLabel },
    input.durationDays && {
      "@type": "PropertyValue",
      name: "Masa aktif",
      value: `${input.durationDays} hari`,
    },
    input.coverage && { "@type": "PropertyValue", name: "Cakupan", value: input.coverage },
  ].filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    sku: input.sku,
    category: "eSIM",
    inLanguage: "id-ID",
    ...(input.image ? { image: input.image } : {}),
    brand: { "@type": "Brand", name: "Djiwa Travel" },
    ...(props.length ? { additionalProperty: props } : {}),
    offers: {
      "@type": "Offer",
      url: input.url,
      priceCurrency: "IDR",
      price: input.priceIdr,
      priceValidUntil: validUntil,
      itemCondition: "https://schema.org/NewCondition",
      availability:
        input.available === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      seller: { "@type": "Organization", name: "Djiwa Travel", url: `${SEO_BASE_URL}/` },
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
    description:
      "Layanan eSIM internasional untuk traveler Indonesia: bayar Rupiah lewat QRIS atau virtual account, eSIM dikirim digital.",
    areaServed: "ID",
    knowsAbout: ["eSIM", "paket data roaming internasional", "travel"],
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
