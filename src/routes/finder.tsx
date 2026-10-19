import { createFileRoute, Link } from "@tanstack/react-router";
import { TabBar } from "@/components/shell";
import { FixedLayer } from "@/components/motion-primitives";
import { useState } from "react";
import { recommendPackages } from "@/lib/recommendation/recommend-packages.server";
import { destinations } from "@/lib/catalog";
import { ACTION_STAGES, useStagedLabel } from "@/lib/progress-stages";
import { DURATION_OPTIONS } from "@/lib/finder-form";
import type { RecommendationPreferences } from "@/lib/recommendation/preferences";
import { trackAnalytics } from "@/lib/analytics";
import {
  packageCoverageLabel,
  packageDataLabel,
  packageDestinationLabel,
} from "@/lib/package-copy";
export const Route = createFileRoute("/finder")({
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
      { property: "og:url", content: "https://djiwatravel.com/finder" },
    ],
    links: [{ rel: "canonical", href: "https://djiwatravel.com/finder" }],
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
  const [destination, setDestination] = useState("JP");
  const [days, setDays] = useState(7);
  const [dataNeed, setDataNeed] = useState<RecommendationPreferences["dataNeed"]>("medium");
  const [budget, setBudget] = useState(200000);
  const [result, setResult] = useState<Awaited<ReturnType<typeof recommendPackages>> | null>(null);
  const [loading, setLoading] = useState(false);
  const loadingLabel = useStagedLabel(loading, ACTION_STAGES.search);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
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
      trackAnalytics("finder_submit", "/finder", {
        durationDays: days,
        dataNeed,
        budgetBand: budget < 100000 ? "under_100k" : budget < 300000 ? "100k_300k" : "300k_plus",
      });
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <main className="mx-auto min-h-screen max-w-4xl bg-background px-4 pb-24 py-8 text-foreground">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Djiwa Travel
          </p>
          <h1 className="mt-2 text-2xl font-bold">Cari paket yang cocok</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Jawab singkat, kami urutkan paket live berdasarkan kebutuhanmu.
          </p>
        </header>
        <form
          onSubmit={submit}
          className="mt-6 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4"
        >
          <label className="text-sm">
            Destinasi
            <select
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3"
              aria-label="Pilih destinasi"
            >
              {destinations.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.flag} {item.nameId}
                  {item.region === "Regional" ? " · Regional" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Masa aktif
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3"
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
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3"
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
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3"
            />
          </label>
          <button
            disabled={loading}
            className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground sm:col-span-4"
          >
            {loading ? loadingLabel : "Tampilkan rekomendasi"}
          </button>
        </form>
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
      </main>
      <FixedLayer>
        <TabBar />
      </FixedLayer>
    </>
  );
}
