import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ChevronRight, Search } from "lucide-react";
import { BackBar, Page } from "@/components/shell";
import { useState } from "react";
import { useTypingPlaceholder } from "@/hooks/use-typing-placeholder";
import { getBundleGroups, getListableDestinations } from "@/lib/destination-availability.fn";
import { exploreAvailability, exploreErrorState } from "@/lib/explore-availability";
export const Route = createFileRoute("/esim/finder")({
  loader: async () => {
    try {
      const [destinations, bundles] = await Promise.all([
        getListableDestinations(),
        // Provider-derived bundles; a failure hides the section instead of blocking the list.
        getBundleGroups().catch(() => ({ groups: [] })),
      ]);
      return { ...exploreAvailability(destinations, "live"), bundles: bundles.groups };
    } catch {
      return {
        ...exploreErrorState("Daftar destinasi belum dapat dimuat. Coba lagi sebentar."),
        bundles: [],
      };
    }
  },
  head: () => ({
    meta: [
      { title: "Pilih destinasi eSIM — Djiwa Travel" },
      {
        name: "description",
        content: "Pilih destinasi untuk melihat semua paket eSIM yang tersedia.",
      },
      { property: "og:title", content: "Pilih destinasi eSIM — Djiwa Travel" },
      {
        property: "og:description",
        content: "Pilih destinasi untuk melihat semua paket eSIM yang tersedia.",
      },
      { property: "og:url", content: "https://djiwatravel.com/esim/finder" },
    ],
    links: [{ rel: "canonical", href: "https://djiwatravel.com/esim/finder" }],
  }),
  component: Finder,
});

function Finder() {
  const available = Route.useLoaderData();
  const router = useRouter();
  const [destinationQuery, setDestinationQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const destinationPlaceholder = useTypingPlaceholder({
    fallback: "Cari negara atau kawasan",
    examples: ["Jepang", "Singapura", "Thailand", "Eropa"],
    paused: searchFocused || Boolean(destinationQuery),
  });
  const showBundles = !destinationQuery.trim() && available.bundles.length > 0;
  const visibleDestinations = available.destinations.filter((item) =>
    `${item.nameId} ${item.region} ${item.code}`
      .toLocaleLowerCase("id-ID")
      .includes(destinationQuery.trim().toLocaleLowerCase("id-ID")),
  );
  return (
    <>
      <Page>
        <BackBar title="eSIM Finder" />
        <header className="pt-2">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight">
            Pilih destinasi eSIM
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Pilih tujuan perjalanan untuk melihat semua paket eSIM dan memilih yang sesuai.
          </p>
        </header>
        <section className="mt-4" aria-labelledby="finder-destinations-title">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="finder-destinations-title" className="text-base font-semibold">
              Pilih destinasi
            </h2>
            <span className="text-xs text-muted-foreground">
              {available.destinations.length} tersedia
            </span>
          </div>
          <label className="mb-3 flex h-11 items-center gap-2 rounded-xl border border-border bg-surface px-3 focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <input
              value={destinationQuery}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
              onChange={(event) => setDestinationQuery(event.target.value)}
              placeholder={destinationPlaceholder}
              aria-label="Cari destinasi eSIM"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          {showBundles && (
            <section
              id="multi-negara"
              className="mt-1 mb-4 scroll-mt-4"
              aria-labelledby="bundles-title"
            >
              <h2
                id="bundles-title"
                className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Satu eSIM, banyak negara
              </h2>
              <div className="no-scrollbar -mx-4 mt-2 flex snap-x gap-2 overflow-x-auto scroll-px-4 px-4 pb-1">
                {available.bundles.map((group) => (
                  <Link
                    key={group.code}
                    to="/destination/$code"
                    params={{ code: group.code.toLowerCase() }}
                    search={{ availability: "all" }}
                    aria-label={`Paket eSIM multi-negara ${group.label}`}
                    className="tap flex w-[9rem] shrink-0 snap-start items-center gap-2 rounded-2xl bg-surface px-2.5 py-2 ring-1 ring-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="text-xl leading-none" aria-hidden="true">
                      {group.flag}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold leading-tight">
                        {group.label}
                      </span>
                      <span className="block truncate text-[10.5px] leading-tight text-muted-foreground">
                        {group.countryCount} negara · {group.packageCount} paket
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-semibold leading-tight text-brand-red">
                        Mulai Rp{group.fromPriceIdr.toLocaleString("id-ID")}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          {available.source === "error" ? (
            <div role="alert" className="rounded-2xl bg-surface p-4 text-sm text-muted-foreground">
              <p>{available.errorMessage}</p>
              <button
                type="button"
                onClick={() => void router.invalidate()}
                className="mt-3 min-h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
              >
                Coba lagi
              </button>
            </div>
          ) : visibleDestinations.length ? (
            <div className="divide-y divide-border/70 overflow-hidden rounded-2xl bg-surface">
              {visibleDestinations.map((item) => (
                <Link
                  key={item.code}
                  to="/destination/$code"
                  params={{ code: item.code.toLowerCase() }}
                  search={{ availability: "all" }}
                  aria-label={`Lihat semua paket eSIM untuk ${item.nameId}`}
                  className="tap flex min-h-[68px] w-full items-center gap-3 px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring hover:bg-secondary/60"
                >
                  <span
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xl"
                    aria-hidden="true"
                  >
                    {item.flag}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{item.nameId}</span>
                    <span className="mt-0.5 block text-[13px] text-muted-foreground">
                      {item.region} · Paket eSIM
                    </span>
                  </span>
                  <ChevronRight
                    className="size-5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl bg-surface px-4 py-3 text-sm text-muted-foreground">
              {available.destinations.length
                ? "Destinasi tidak ditemukan."
                : "Belum ada destinasi live dari katalog."}
            </p>
          )}
        </section>
      </Page>
    </>
  );
}
