import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Search, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Page, group } from "@/components/shell";
import { destinations, search } from "@/lib/catalog";
import { isRecommendablePackage } from "@/lib/esim-access-catalog";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { getSellabilityState } from "@/lib/sellability.server";
import { exploreAvailability, exploreErrorState } from "@/lib/explore-availability";
import { CatalogRoutePending } from "@/components/route-loading";

export const Route = createFileRoute("/explore")({
  // Explore is the only package list now, so it carries the catalog's caching: one
  // expensive reseller read, reused for a minute so coming back is instant.
  staleTime: 60_000,
  pendingMs: 0,
  pendingMinMs: 320,
  pendingComponent: CatalogRoutePending,
  loader: async () => {
    try {
      const catalog = await getResellerCatalog();
      const packages = catalog.packages.filter(isRecommendablePackage);
      const sellability = await getSellabilityState(packages);
      const sellable = packages.filter((pkg) => !sellability.hidden.has(pkg.packageCode));
      const codes = new Set(
        sellable.flatMap((pkg) => pkg.locationCodes.map((code) => code.trim().toUpperCase())),
      );
      return exploreAvailability(
        destinations.filter((destination) => codes.has(destination.code.toUpperCase())),
        catalog.stale ? "cached" : "live",
      );
    } catch {
      return exploreErrorState();
    }
  },
  head: () => ({
    meta: [
      { title: "Cari destinasi — Djiwa Travel" },
      { name: "description", content: "Cari eSIM untuk negara atau wilayah tujuanmu." },
      { property: "og:title", content: "Cari destinasi — Djiwa Travel" },
      { property: "og:description", content: "Cari eSIM untuk negara atau wilayah tujuanmu." },
    ],
  }),
  component: Explore,
});

function Explore() {
  const router = useRouter();
  const available = Route.useLoaderData();
  const [q, setQ] = useState("");
  const res = search(q).filter((destination) =>
    available.destinations.some((item) => item.code === destination.code),
  );
  return (
    <Page>
      <h1 className="large-title pt-4">Explore</h1>
      <p className="mt-2 text-sm text-muted-foreground">Paket negara untuk satu tujuan, atau paket regional untuk beberapa negara sekaligus.</p>
      <label className="mt-3 flex h-11 items-center gap-2 rounded-xl bg-surface px-3 shadow-sm">
        <Search className="size-5 text-muted-foreground" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Jepang, Korea, Eropa…"
          className="flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
        />
      </label>
      <Link
        to="/finder"
        className="tap mt-3 flex items-center gap-3 rounded-2xl bg-brand-red-soft p-3"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold">Bingung pilih paket?</p>
          <p className="truncate text-[12px] text-muted-foreground">
            Jawab 3 pertanyaan, kami urutkan yang paling cocok
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-brand-red" />
      </Link>
      {available.source === "error" && (
        <div role="alert" className="mt-4 rounded-2xl bg-surface p-5 text-center shadow-sm">
          <p className="font-semibold">Explore belum dapat dimuat</p>
          <p className="mt-2 text-sm text-muted-foreground">{available.errorMessage} Tidak ada paket yang dibuat-buat.</p>
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
      {res.length === 0 ? (
        available.source === "error" ? null : (
          <p className="mt-16 text-center text-muted-foreground">
            Belum ada untuk “{q}”. Coba nama negara lain.
          </p>
        )
      ) : (
        <div className={`${group} mt-4`}>
          {res.map((d) => (
            <Link
              key={d.code}
              to="/destination/$code"
              params={{ code: d.code.toLowerCase() }}
              className="flex items-center gap-3 px-4 py-2.5 active:bg-secondary"
            >
              <span className="shrink-0 text-2xl">{d.flag}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{d.nameId}</p>
                <p className="text-[12px] text-muted-foreground">{d.region === "Regional" ? "Paket regional · beberapa negara" : "Paket negara · satu tujuan"}</p>
              </div>
              <ChevronRight className="size-5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </Page>
  );
}
