import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Search, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Page, group } from "@/components/shell";
import { search } from "@/lib/catalog";
import { isRecommendablePackage } from "@/lib/esim-access-catalog";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { getSellabilityState } from "@/lib/sellability.server";
import { listableDestinations } from "@/lib/destination-availability";
import { finderCtaCopy } from "@/lib/finder-form";
import { exploreAvailability, exploreErrorState } from "@/lib/explore-availability";

const EXPLORE_CATALOG_DEADLINE_MS = 8_500;
const EXPLORE_BALANCE_DEADLINE_MS = 2_500;
const EXPLORE_LOG_INTERVAL_MS = 60_000;
const lastExploreLogAt = new Map<string, number>();

function withDeadline<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} deadline exceeded`)), timeoutMs);
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

function logExploreFailure(kind: "catalog" | "balance", error: unknown) {
  const now = Date.now();
  const lastLoggedAt = lastExploreLogAt.get(kind) ?? 0;
  if (now - lastLoggedAt < EXPLORE_LOG_INTERVAL_MS) return;
  lastExploreLogAt.set(kind, now);
  const reason = error instanceof Error && error.message.includes("deadline") ? "deadline" : "provider";
  console.warn(`[travel] explore ${kind} load failed`, { reason });
}

type ExploreLoaderDeps = {
  getCatalog?: typeof getResellerCatalog;
  getSellability?: typeof getSellabilityState;
  catalogDeadlineMs?: number;
  balanceDeadlineMs?: number;
};

export async function loadExploreAvailability({
  getCatalog = getResellerCatalog,
  getSellability = getSellabilityState,
  catalogDeadlineMs = EXPLORE_CATALOG_DEADLINE_MS,
  balanceDeadlineMs = EXPLORE_BALANCE_DEADLINE_MS,
}: ExploreLoaderDeps = {}) {
  let catalog;
  try {
    // Match the provider cache's 8 second timeout; the small margin avoids a same-tick race.
    catalog = await withDeadline(getCatalog(), catalogDeadlineMs, "Explore catalog");
  } catch (error) {
    logExploreFailure("catalog", error);
    return exploreErrorState();
  }

  const packages = catalog.packages.filter(isRecommendablePackage);
  let hidden = new Set<string>();
  try {
    // Balance is display enrichment only. If it is slow, keep the truthful provider catalogue visible.
    const sellability = await withDeadline(
      getSellability(packages),
      balanceDeadlineMs,
      "Explore balance",
    );
    hidden = sellability.hidden;
  } catch (error) {
    logExploreFailure("balance", error);
  }

  const sellable = packages.filter((pkg) => !hidden.has(pkg.packageCode));
  if (sellable.length === 0) {
    return exploreAvailability([], catalog.stale ? "cached" : "live");
  }
  const codes = new Set<string>();
  for (const pkg of sellable) {
    for (const code of pkg.locationCodes) {
      const normalized = code.trim().toUpperCase();
      if (normalized) codes.add(normalized);
    }
  }
  // Regional bundles list their member countries instead of a literal EU/ASIA code, so the list
  // rule is shared with the destination page rather than matched by hand here.
  return exploreAvailability(
    listableDestinations(sellable, {
      codes: [...codes].sort(),
      source: catalog.stale ? "cached" : "live",
      degraded: false,
    }),
    catalog.stale ? "cached" : "live",
  );
}

export const Route = createFileRoute("/explore")({
  // Explore is the only package list now, so it carries the catalog's caching: one
  // expensive reseller read, reused for a minute so coming back is instant.
  staleTime: 60_000,
  loader: () => loadExploreAvailability(),
  head: () => ({
    meta: [
      { title: "Cari destinasi — Djiwa Travel" },
      { name: "description", content: "Cari eSIM untuk negara atau wilayah tujuanmu." },
      { property: "og:title", content: "Cari destinasi — Djiwa Travel" },
      { property: "og:description", content: "Cari eSIM untuk negara atau wilayah tujuanmu." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://djiwatravel.com/explore" },
      { property: "og:image", content: "https://djiwatravel.com/og/default.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Cari destinasi — Djiwa Travel" },
      { name: "twitter:description", content: "Cari eSIM untuk negara atau wilayah tujuanmu." },
      { name: "twitter:image", content: "https://djiwatravel.com/og/default.png" },
    ],
    links: [{ rel: "canonical", href: "https://djiwatravel.com/explore" }],
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
          <p className="truncate text-[12px] text-muted-foreground">{finderCtaCopy()}</p>
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
