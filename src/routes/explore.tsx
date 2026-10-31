import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Search, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Page } from "@/components/shell";
import { destinations, search } from "@/lib/catalog";
import {
  ServiceCategoryGrid,
  ServiceSectionHeading,
} from "@/components/explore/service-category-grid";
import { getListableDestinations } from "@/lib/destination-availability.fn";
import { exploreAvailability } from "@/lib/explore-availability";

export const Route = createFileRoute("/explore")({
  // The resolver reuses the provider cache, handles regional coverage, and falls back to the
  // seeded display list during a transient provider outage. Re-run when returning to Explore so a
  // transient error from another route is never kept as the page's only state.
  staleTime: 0,
  loader: async () => {
    const available = await getListableDestinations();
    return exploreAvailability(available, "live");
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
  const [searchMessage, setSearchMessage] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const reduceMotion = useReducedMotion();
  const [placeholderText, setPlaceholderText] = useState("Cari negara atau kota");
  const res = search(q).filter((destination) =>
    available.destinations.some((item) => item.code === destination.code),
  );
  const searchOptions = (q.trim() ? res : destinations).filter((destination) =>
    available.destinations.some((item) => item.code === destination.code),
  );

  useEffect(() => {
    if (reduceMotion || searchFocused || q) {
      setPlaceholderText("Cari negara atau kota");
      return;
    }

    const examples = ["Jepang", "Singapura", "Thailand"];
    let wordIndex = 0;
    let characterCount = 0;
    let deleting = false;
    let timeout: ReturnType<typeof setTimeout>;

    const tick = () => {
      const word = examples[wordIndex];
      characterCount += deleting ? -1 : 1;
      setPlaceholderText(`Cari ${word.slice(0, characterCount)}`);

      if (!deleting && characterCount === word.length) {
        deleting = true;
        timeout = setTimeout(tick, 1100);
      } else if (deleting && characterCount === 0) {
        deleting = false;
        wordIndex = (wordIndex + 1) % examples.length;
        timeout = setTimeout(tick, 250);
      } else {
        timeout = setTimeout(tick, deleting ? 45 : 85);
      }
    };

    timeout = setTimeout(tick, 500);
    return () => clearTimeout(timeout);
  }, [q, reduceMotion, searchFocused]);
  return (
    <Page>
      <header className="pt-4">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-red">Djiwa Travel</p>
        <h1 className="mt-1 large-title">Explore</h1>
        <p className="mt-2 text-sm text-muted-foreground">Mau pergi ke mana?</p>
      </header>
      <div className="relative">
        <form
          className="mt-4 flex h-12 items-center gap-2 rounded-2xl border border-border/70 bg-surface px-3 focus-within:ring-2 focus-within:ring-ring"
          onSubmit={(event) => {
            event.preventDefault();
            if (!q.trim()) {
              setSearchMessage("Masukkan nama negara atau kota terlebih dahulu.");
              return;
            }
            const destination = res[0];
            if (!destination) {
              setSearchMessage(`Destinasi “${q.trim()}” belum tersedia di katalog.`);
              return;
            }
            setSearchMessage("");
            void router.navigate({
              to: "/destination/$code",
              params: { code: destination.code.toLowerCase() },
            });
          }}
        >
          <Search className="size-5 text-muted-foreground" aria-hidden="true" />
          <input
            value={q}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
            onChange={(e) => {
              setQ(e.target.value);
              setSearchMessage("");
            }}
            placeholder={placeholderText}
            aria-label="Cari destinasi"
            className="flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground"
          />
          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setSearchMessage("");
              }}
              aria-label="Hapus pencarian"
              className="rounded-full px-2 text-lg text-muted-foreground"
            >
              ×
            </button>
          )}
        </form>
        <AnimatePresence>
          {searchFocused && q.trim() && (
            <motion.div
              key="destination-search-results"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
              transition={
                reduceMotion ? { duration: 0.1 } : { duration: 0.18, ease: [0.32, 0.72, 0, 1] }
              }
              className="absolute inset-x-0 top-[calc(100%+8px)] z-20 max-h-72 overflow-y-auto rounded-2xl border border-border bg-surface p-2 shadow-md"
            >
              <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Hasil pencarian
              </p>
              {searchOptions.length > 0 ? (
                searchOptions.map((destination) => (
                  <motion.button
                    layout={!reduceMotion}
                    key={destination.code}
                    type="button"
                    className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-secondary"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setQ(destination.nameId);
                      setSearchFocused(false);
                      setSearchMessage("");
                      void router.navigate({
                        to: "/destination/$code",
                        params: { code: destination.code.toLowerCase() },
                      });
                    }}
                  >
                    <span aria-hidden="true">{destination.flag}</span>
                    <span className="font-medium">{destination.nameId}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {destination.region}
                    </span>
                  </motion.button>
                ))
              ) : (
                <p className="px-3 py-3 text-sm text-muted-foreground" role="status">
                  Tidak ada destinasi yang cocok.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {searchMessage && (
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          {searchMessage}
        </p>
      )}
      <Link
        to="/esim/finder"
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
      <section className="mt-8">
        <ServiceSectionHeading title="Kebutuhan perjalanan" detail="Layanan" />
        <ServiceCategoryGrid />
      </section>
      {res.length === 0 && available.source !== "error" && (
        <p className="mb-6 text-center text-sm text-muted-foreground">
          Belum ada destinasi untuk “{q}”. Coba nama negara lain.
        </p>
      )}
    </Page>
  );
}
