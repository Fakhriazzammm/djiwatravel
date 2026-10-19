import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Search, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Page } from "@/components/shell";
import { destinations, search } from "@/lib/catalog";
import {
  ServiceCategoryGrid,
  ServiceSectionHeading,
} from "@/components/explore/service-category-grid";
import { DestinationCard } from "@/components/explore/destination-card";
import { FeaturedServiceCard } from "@/components/explore/featured-service-card";
import { AiTripPlannerCard } from "@/components/explore/ai-trip-planner-card";
import { affiliateServices, activeAffiliateServices } from "@/lib/affiliate-services";
import { isRecommendablePackage } from "@/lib/esim-access-catalog";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { getSellabilityState } from "@/lib/sellability.server";
import { exploreAvailability, loadExploreAvailability } from "@/lib/explore-availability";

function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Explore catalog deadline exceeded")),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export const Route = createFileRoute("/explore")({
  // Explore is the only package list now, so it carries the catalog's caching: one
  // expensive reseller read, reused for a minute so coming back is instant.
  staleTime: 60_000,
  loader: async () => {
    return loadExploreAvailability({
      attempt: async (timeoutMs) => {
        const catalog = await withDeadline(getResellerCatalog(), timeoutMs);
        const packages = catalog.packages.filter(isRecommendablePackage);
        const sellability = await withDeadline(getSellabilityState(packages), timeoutMs);
        const sellable = packages.filter((pkg) => !sellability.hidden.has(pkg.packageCode));
        const codes = new Set(
          sellable.flatMap((pkg) => pkg.locationCodes.map((code) => code.trim().toUpperCase())),
        );
        return exploreAvailability(
          destinations.filter((destination) => codes.has(destination.code.toUpperCase())),
          catalog.stale ? "cached" : "live",
        );
      },
    });
  },
  head: () => ({
    meta: [
      { title: "Explore — Djiwa Travel" },
      {
        name: "description",
        content: "Temukan destinasi dan kebutuhan perjalanan internasionalmu.",
      },
      { property: "og:title", content: "Explore — Djiwa Travel" },
      {
        property: "og:description",
        content: "Temukan destinasi dan kebutuhan perjalanan internasionalmu.",
      },
      { property: "og:url", content: "https://djiwatravel.com/explore" },
    ],
    links: [{ rel: "canonical", href: "https://djiwatravel.com/explore" }],
  }),
  // A cold provider read can legitimately take a few seconds; say so instead of showing a gap.
  pendingComponent: () => (
    <Page>
      <h1 className="large-title pt-4">Explore</h1>
      <p className="mt-6 text-sm text-muted-foreground" role="status">
        Memuat katalog…
      </p>
    </Page>
  ),
  component: Explore,
});

function Explore() {
  const router = useRouter();
  const available = Route.useLoaderData();
  const [q, setQ] = useState("");
  const res = search(q).filter((destination) =>
    available.destinations.some((item) => item.code === destination.code),
  );
  const popular = destinations.filter(
    (destination) => destination.popular && res.includes(destination),
  );
  const featured = popular.slice(0, 3);
  const affiliates = activeAffiliateServices(affiliateServices);
  return (
    <Page>
      <header className="pt-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-red">Djiwa Travel</p>
        <h1 className="mt-1 large-title">Explore</h1>
        <p className="mt-2 text-sm text-muted-foreground">Mau pergi ke mana?</p>
      </header>
      <label className="mt-4 flex h-12 items-center gap-2 rounded-2xl bg-surface px-3 shadow-sm ring-1 ring-border/60 focus-within:ring-2 focus-within:ring-ring">
        <Search className="size-5 text-muted-foreground" aria-hidden="true" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari negara atau kota"
          aria-label="Cari destinasi"
          className="flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Hapus pencarian"
            className="rounded-full px-2 text-lg text-muted-foreground"
          >
            ×
          </button>
        )}
      </label>
      <Link
        to="/finder"
        className="tap mt-3 flex items-center gap-3 rounded-2xl bg-brand-red-soft p-3"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Bingung pilih paket eSIM?</p>
          <p className="truncate text-[12px] text-muted-foreground">
            Temukan paket yang cocok untuk perjalananmu.
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-brand-red" />
      </Link>
      {available.source === "error" && (
        <div role="alert" className="mt-4 rounded-2xl bg-surface p-5 text-center shadow-sm">
          <p className="font-semibold">Explore belum dapat dimuat</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {available.errorMessage} Tidak ada paket yang dibuat-buat.
          </p>
          <button
            type="button"
            onClick={() => void router.invalidate()}
            className="mt-4 min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
          >
            Coba lagi
          </button>
        </div>
      )}
      {available.source === "cached" && (
        <p className="mt-3 rounded-xl bg-secondary p-3 text-sm text-muted-foreground">
          Menampilkan katalog tersimpan; harga mungkin belum terbaru.
        </p>
      )}

      <section className="mt-7">
        <ServiceSectionHeading title="Layanan perjalanan" detail="Pilih kebutuhanmu" />
        <ServiceCategoryGrid />
      </section>
      <section className="mt-8">
        <ServiceSectionHeading title="Destinasi populer" detail="Lihat semua" />
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 no-scrollbar">
          {popular.length > 0 ? (
            popular.map((destination) => (
              <DestinationCard key={destination.code} destination={destination} available={true} />
            ))
          ) : (
            <p className="rounded-2xl bg-surface p-4 text-sm text-muted-foreground">
              Belum ada destinasi live dari katalog.
            </p>
          )}
        </div>
      </section>
      <section className="mt-8">
        <ServiceSectionHeading title="Pilihan untukmu" />
        <div className="space-y-3">
          {featured.map((destination) => (
            <FeaturedServiceCard key={destination.code} destination={destination} />
          ))}
          {affiliates.map((affiliate) => (
            <FeaturedServiceCard key={affiliate.id} affiliate={affiliate} />
          ))}
          {featured.length === 0 && affiliates.length === 0 && (
            <div className="rounded-2xl bg-surface p-4 text-sm text-muted-foreground">
              Rekomendasi layanan akan tampil saat katalog tersedia.
            </div>
          )}
        </div>
      </section>
      <section className="mt-8 pb-4">
        <AiTripPlannerCard />
      </section>
      {res.length === 0 && available.source !== "error" && (
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Belum ada destinasi untuk “{q}”. Coba nama negara lain.
        </p>
      )}
    </Page>
  );
}
