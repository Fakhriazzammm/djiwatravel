import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Check, Search } from "lucide-react";
import { BackBar, Page } from "@/components/shell";
import { useState } from "react";
import { recommendPackages } from "@/lib/recommendation/recommend-packages.server";
import { getListableDestinations } from "@/lib/destination-availability.server";
import { exploreAvailability, exploreErrorState } from "@/lib/explore-availability";
import { ACTION_STAGES, useStagedLabel } from "@/lib/progress-stages";
import { DURATION_OPTIONS } from "@/lib/finder-form";
import type { RecommendationPreferences } from "@/lib/recommendation/preferences";
import { trackAnalytics } from "@/lib/analytics";
import {
  packageCoverageLabel,
  packageDataLabel,
  packageDestinationLabel,
} from "@/lib/package-copy";
export const Route = createFileRoute("/esim/finder")({
  loader: async () => {
    try {
      return exploreAvailability(await getListableDestinations(), "live");
    } catch {
      return exploreErrorState("Daftar destinasi belum dapat dimuat. Coba lagi sebentar.");
    }
  },
  head: () => ({
    meta: [
      { title: "Cari paket eSIM — Djiwa Travel" },
      {
        name: "description",
        content: "Jawab beberapa pertanyaan untuk menemukan paket eSIM yang cocok.",
      },
      { property: "og:title", content: "Cari paket eSIM — Djiwa Travel" },
      {
        property: "og:description",
        content: "Temukan paket eSIM berdasarkan tujuan, durasi, kebutuhan data, dan budget.",
      },
      { property: "og:url", content: "https://djiwatravel.com/esim/finder" },
    ],
    links: [{ rel: "canonical", href: "https://djiwatravel.com/esim/finder" }],
  }),
  component: Finder,
});

function formatBudget(value: number) {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

function parseBudget(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}
function rupiah(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function Finder() {
  const available = Route.useLoaderData();
  const router = useRouter();
  const [destination, setDestination] = useState(() => available.destinations[0]?.code ?? "");
  const [destinationQuery, setDestinationQuery] = useState("");
  const [days, setDays] = useState(7);
  const [dataNeed, setDataNeed] = useState<RecommendationPreferences["dataNeed"]>("medium");
  const [budget, setBudget] = useState(200000);
  const [result, setResult] = useState<Awaited<ReturnType<typeof recommendPackages>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const loadingLabel = useStagedLabel(loading, ACTION_STAGES.search);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage("");
    try {
      const preferences = {
        destinations: destination
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        durationDays: days,
        dataNeed,
        budgetIdr: budget,
      };
      const next = await recommendPackages({ data: preferences });
      setResult(next);
      trackAnalytics("finder_submit", "/esim/finder", {
        durationDays: days,
        dataNeed,
        budgetBand: budget < 100000 ? "under_100k" : budget < 300000 ? "100k_300k" : "300k_plus",
      });
    } catch {
      setResult(null);
      setErrorMessage(
        "Rekomendasi belum bisa dimuat. Coba lagi sebentar; pilihanmu tetap tersimpan.",
      );
    } finally {
      setLoading(false);
    }
  }
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
          <h1 className="large-title">Pilih destinasi eSIM</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Pilih tujuan perjalanan, lalu sesuaikan paket dengan kebutuhanmu.
          </p>
        </header>
        <section className="mt-5" aria-labelledby="finder-destinations-title">
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
              onChange={(event) => setDestinationQuery(event.target.value)}
              placeholder="Cari negara atau kawasan"
              aria-label="Cari destinasi eSIM"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
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
              {visibleDestinations.map((item) => {
                const selected = destination === item.code;
                return (
                  <button
                    key={item.code}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setDestination(item.code)}
                    className={`tap flex min-h-[68px] w-full items-center gap-3 px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected ? "bg-secondary/60" : ""}`}
                  >
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xl"
                      aria-hidden="true"
                    >
                      {item.flag}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">
                        {item.nameId}
                      </span>
                      <span className="mt-0.5 block text-[13px] text-muted-foreground">
                        {item.region} · Paket eSIM
                      </span>
                    </span>
                    {selected && (
                      <Check className="size-5 shrink-0 text-brand-red" aria-label="Dipilih" />
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="rounded-2xl bg-surface px-4 py-5 text-sm text-muted-foreground">
              {available.destinations.length
                ? "Destinasi tidak ditemukan."
                : "Belum ada destinasi live dari katalog."}
            </p>
          )}
        </section>
        <form
          onSubmit={submit}
          className="mt-5 grid gap-4 rounded-2xl bg-surface p-4 sm:grid-cols-2"
        >
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Destinasi dipilih:{" "}
            <span className="font-semibold text-foreground">
              {available.destinations.find((item) => item.code === destination)?.nameId ??
                "Pilih destinasi di atas"}
            </span>
          </p>
          <label className="text-sm">
            Masa aktif
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3"
              aria-label="Pilih masa aktif"
            >
              {DURATION_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value} hari
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Kebutuhan data
            <select
              value={dataNeed}
              onChange={(e) => setDataNeed(e.target.value as RecommendationPreferences["dataNeed"])}
              className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3"
            >
              <option value="low">Hemat</option>
              <option value="medium">Sedang</option>
              <option value="high">Tinggi</option>
              <option value="unlimited">Unlimited</option>
            </select>
          </label>
          <label className="text-sm">
            Budget
            <input
              type="text"
              inputMode="numeric"
              value={formatBudget(budget)}
              onChange={(e) => setBudget(parseBudget(e.target.value))}
              aria-label="Masukkan budget dalam Rupiah"
              className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3"
            />
          </label>
          <button
            disabled={loading || !destination || available.source === "error"}
            className="h-12 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground sm:col-span-2"
          >
            {loading ? loadingLabel : "Tampilkan rekomendasi"}
          </button>
        </form>
        {errorMessage && (
          <div
            role="alert"
            className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {errorMessage}
          </div>
        )}
        {result && (
          <section className="mt-6">
            <div className="rounded-xl border border-border bg-card p-4 text-sm">
              Rekomendasi berdasarkan katalog live.
              <span className="ml-2 text-xs text-muted-foreground">
                Urutan berdasarkan kebutuhan perjalanan
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {result.recommendations.map((item) => (
                <article
                  key={item.packageCode}
                  className={`rounded-2xl border p-4 ${
                    item.package.sellable ? "border-border bg-card" : "border-red-200 bg-red-50/70"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                    {item.category.replace("_", " ")}
                  </p>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="mt-2 font-semibold leading-snug">
                      {packageDestinationLabel(item.package)}
                    </h2>
                    {!item.package.sellable && (
                      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                        Sold
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {packageDataLabel(item.package)} · {item.package.durationDays} hari masa aktif
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Cakupan: {packageCoverageLabel(item.package)}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">Harga paket</p>
                  <p className="text-lg font-bold">{rupiah(item.package.priceIdr)}</p>
                  <ul className="mt-3 list-disc pl-5 text-xs text-muted-foreground">
                    {item.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <div className="mt-4">
                    {item.package.sellable ? (
                      <Link
                        to="/checkout/$id"
                        params={{ id: item.packageCode }}
                        className="inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
                      >
                        Lihat detail &amp; pilih
                      </Link>
                    ) : (
                      <span
                        className="inline-flex w-full items-center justify-center rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-muted-foreground"
                        aria-label="Paket sold dan tidak dapat dibeli"
                      >
                        Sold
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {result.recommendations.length === 0 && (
              <p className="mt-4 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                Belum ada paket yang cocok. Coba naikkan budget atau pilih kebutuhan data yang lebih
                rendah.
              </p>
            )}
          </section>
        )}
      </Page>
    </>
  );
}
