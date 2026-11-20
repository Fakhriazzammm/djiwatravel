import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Compass,
  FileCheck2,
  MapPin,
  Plane,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Ticket,
  Truck,
} from "lucide-react";

export type ExploreAsset = { src: string; alt: string; fallback: LucideIcon };

const ASSET_VERSION = "djiwa-explore-20261030";

const assetPath = (name: string, extension = "svg") =>
  `/assets/explore/services/${name}.${extension}?v=${ASSET_VERSION}`;

export const exploreAssets: Record<string, ExploreAsset> = {
  esim: { src: assetPath("esim-travo-v1", "webp"), alt: "Ikon 3D eSIM", fallback: Smartphone },
  attractions: {
    src: assetPath("attractions-travo-v1", "webp"),
    alt: "Ikon 3D aktivitas wisata",
    fallback: Ticket,
  },
  transportation: {
    src: assetPath("flight-plane-travo-v1", "webp"),
    alt: "Ikon 3D pesawat",
    fallback: Plane,
  },
  itinerary: {
    src: assetPath("itinerary-travo-v1", "webp"),
    alt: "Travo menunjuk tujuan di buku itinerary",
    fallback: BookOpen,
  },
  "open-trip": {
    src: assetPath("open-trip-travo-v1", "webp"),
    alt: "Ikon 3D open trip",
    fallback: MapPin,
  },
  shipping: {
    src: assetPath("shipping-truck-travo-v1", "webp"),
    alt: "Ikon 3D truk pengiriman",
    fallback: Truck,
  },
  "personal-shopper": {
    src: assetPath("personal-shopper-travo-v1", "webp"),
    alt: "Ikon 3D titip belanja",
    fallback: ShoppingBag,
  },
  visa: {
    src: assetPath("visa-travo-v1", "webp"),
    alt: "Ikon 3D layanan visa",
    fallback: FileCheck2,
  },
  "travel-insurance": {
    src: assetPath("travel-insurance-travo-v1", "webp"),
    alt: "Ikon 3D asuransi perjalanan",
    fallback: ShieldCheck,
  },
};

export const exploreAssetReview = {
  source: "OpenAI image generation with the approved Travo reference and Open Trip icon",
  provider: "OpenAI image generation",
  promptVersion: "explore-open-trip-travo-v1",
  reviewed: true,
  note: "Open Trip uses a transparent 192px WebP optimized for the 54px Explore slot; the adjacent label remains the semantic explanation.",
};

export function assetForService(icon: string): ExploreAsset {
  return exploreAssets[icon] ?? { src: "", alt: "Ikon layanan perjalanan", fallback: Compass };
}
