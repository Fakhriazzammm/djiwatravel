import type { LucideIcon } from "lucide-react";
import {
  Compass,
  FileCheck2,
  Luggage,
  MapPin,
  Plane,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Ticket,
} from "lucide-react";

export type ExploreAsset = { src: string; alt: string; fallback: LucideIcon };

const ASSET_VERSION = "djiwa-explore-20261030";

const assetPath = (name: string, extension = "svg") =>
  `/assets/explore/services/${name}.${extension}?v=${ASSET_VERSION}`;

export const exploreAssets: Record<string, ExploreAsset> = {
  esim: { src: assetPath("esim"), alt: "Ikon 3D eSIM", fallback: Smartphone },
  attractions: {
    src: assetPath("attractions"),
    alt: "Ikon 3D aktivitas wisata",
    fallback: Ticket,
  },
  transportation: {
    src: assetPath("transportation"),
    alt: "Ikon 3D transportasi",
    fallback: Plane,
  },
  "open-trip": {
    src: assetPath("open-trip-v2", "png"),
    alt: "Ikon 3D open trip",
    fallback: MapPin,
  },
  baggage: {
    src: assetPath("baggage"),
    alt: "Ikon 3D bagasi",
    fallback: Luggage,
  },
  "personal-shopper": {
    src: assetPath("personal-shopper"),
    alt: "Ikon 3D titip belanja",
    fallback: ShoppingBag,
  },
  visa: {
    src: assetPath("visa"),
    alt: "Ikon 3D layanan visa",
    fallback: FileCheck2,
  },
  "travel-insurance": {
    src: assetPath("travel-insurance"),
    alt: "Ikon 3D asuransi perjalanan",
    fallback: ShieldCheck,
  },
};

export const exploreAssetReview = {
  source: "OpenAI image generation from the user-provided Explore screenshot as a style reference",
  provider: "OpenAI image generation",
  promptVersion: "explore-open-trip-3d-v2",
  reviewed: true,
  note: "Open Trip uses a transparent 320px PNG optimized for the 54px Explore slot; the adjacent label remains the semantic explanation.",
};

export function assetForService(icon: string): ExploreAsset {
  return exploreAssets[icon] ?? { src: "", alt: "Ikon layanan perjalanan", fallback: Compass };
}
