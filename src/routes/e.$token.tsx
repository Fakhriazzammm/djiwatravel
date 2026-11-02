import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { ArrowRight, CircleAlert, Loader2, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { Page, Wordmark, btnRed, btnSoft, group, row } from "@/components/shell";
import { EsimInstallPanel, ManualDetails } from "@/components/esim-install";
import { TravelUsageCard } from "@/components/travel-usage-card";
import { claimSharedEsim, getSharedEsim } from "@/lib/esim-share.fn";
import type { SharedEsimLanding, SharedEsimView } from "@/lib/esim-share";
import { formatGb, usageView } from "@/lib/travel-journey";

export const Route = createFileRoute("/e/$token")({
  loader: async ({ params }) => {
    try {
      return await getSharedEsim({ data: { token: params.token } });
    } catch {
      return { state: "unavailable" } as SharedEsimLanding;
    }
  },
  head: () => ({
    meta: [
      { title: "eSIM untukmu — Djiwa Travel" },
      {
        name: "description",
        content:
          "Seseorang mengirimimu eSIM lewat Djiwa Travel. Buka linknya di HP yang akan dipakai.",
      },
      { name: "robots", content: "noindex, nofollow" },
      // The token is the capability; never leak it to third-party origins through Referer.
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: SharedEsimPage,
});

const dateLabel = (value: number | null) =>
  value === null
    ? null
    : new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(value));

const quotaLabel = (quotaBytes: number | null, unlimited: boolean) => {
  if (unlimited) return "Unlimited";
  return quotaBytes && quotaBytes > 0 ? formatGb(quotaBytes) : "Mengikuti paket";
};

function SharedEsimPage() {
  const { token } = Route.useParams();
  const initial = Route.useLoaderData();
  const [landing, setLanding] = useState<SharedEsimLanding>(initial);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    setClaiming(true);
    setError(null);
    try {
      const next = await claimSharedEsim({ data: { token } });
      setLanding(next);
    } catch {
      setError("eSIM belum bisa dibuka. Periksa koneksi lalu coba lagi.");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <Page tabs={false}>
      <div className="flex items-center justify-between gap-3 pb-5 pt-4">
        <Wordmark className="h-8" />
        <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          eSIM untukmu
        </span>
      </div>

      {landing.state === "unavailable" && (
        <StateCard
          icon={<CircleAlert className="size-5 text-brand-red" aria-hidden="true" />}
          title="Link tidak tersedia"
          detail="Link mungkin sudah dicabut, sudah dibuka di perangkat lain, atau masa aktif eSIM sudah berakhir. Minta pengirim membuat link baru."
        />
      )}

      {landing.state === "claimed_elsewhere" && (
        <StateCard
          icon={<ShieldCheck className="size-5 text-brand-red" aria-hidden="true" />}
          title="Link sudah dibuka di perangkat lain"
          detail="Demi keamanan, satu link hanya bisa dibuka di satu browser. Minta pengirim mengirim link baru kalau kamu belum sempat memasang eSIM ini."
        />
      )}

      {landing.state === "available" && (
        <>
          <section className="rounded-3xl bg-surface p-5" data-testid="shared-esim-preview">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-red-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-red">
              <Sparkles className="size-3.5" aria-hidden="true" /> Hadiah eSIM
            </span>
            <h1 className="mt-4 text-[26px] font-bold leading-tight">
              {landing.preview.packageName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Seseorang mengirimimu paket ini. Buka di HP yang akan memakai eSIM, lalu pasang dengan
              Wi-Fi.
            </p>

            <dl className={`${group} mt-5`}>
              <div className={row}>
                <dt className="text-[13px] text-muted-foreground">Destinasi</dt>
                <dd className="text-right text-[14px] font-semibold">
                  {landing.preview.locationCodes.join(" · ") || "Regional"}
                </dd>
              </div>
              <div className={row}>
                <dt className="text-[13px] text-muted-foreground">Durasi</dt>
                <dd className="text-right text-[14px] font-semibold">
                  {landing.preview.durationDays > 0
                    ? `${landing.preview.durationDays} hari`
                    : "Mengikuti paket"}
                </dd>
              </div>
              <div className={row}>
                <dt className="text-[13px] text-muted-foreground">Kuota</dt>
                <dd className="text-right text-[14px] font-semibold">
                  {quotaLabel(landing.preview.quotaBytes, landing.preview.unlimited)}
                </dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={() => void claim()}
              disabled={claiming}
              className={`${btnRed} mt-4`}
            >
              {claiming ? (
                <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              ) : (
                <Smartphone className="size-5" aria-hidden="true" />
              )}
              {claiming ? "Membuka eSIM…" : "Buka eSIM di perangkat ini"}
            </button>
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-brand-red-soft p-3 text-sm text-brand-red"
              >
                {error}
              </p>
            )}
            <p className="mt-3 text-center text-[12px] leading-5 text-muted-foreground">
              Tekan tombol ini di HP tujuan. Setelah dibuka, link terikat ke browser ini dan tidak
              bisa dibuka di perangkat lain.
            </p>
          </section>

          <p className="mt-3 flex items-start gap-2 px-1 text-[12px] leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            Djiwa Travel tidak menampilkan data pesanan, harga, atau identitas pengirim di halaman
            ini.
          </p>
        </>
      )}

      {landing.state === "open" && <OpenEsim view={landing.view} />}

      <div className="mt-4 flex flex-col gap-2">
        <Link to="/" className={`${btnSoft} text-center`}>
          Buka Djiwa Travel <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Link to="/support" className="text-center text-xs font-semibold text-muted-foreground">
          Butuh bantuan?
        </Link>
      </div>
    </Page>
  );
}

function StateCard({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <section className="rounded-3xl bg-surface p-5">
      <div className="flex items-center gap-2">
        {icon}
        <h1 className="text-lg font-bold">{title}</h1>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
    </section>
  );
}

function OpenEsim({ view }: { view: SharedEsimView }) {
  const usage = view.usage;
  const usageReport = usageView({
    volumeBytes: usage?.totalBytes ?? view.quotaBytes,
    usedGb: usage ? usage.usedBytes / 1_000_000_000 : null,
    measuredAt: usage?.measuredAt ?? null,
    unlimited: view.unlimited,
    active: true,
    lowPercent: 20,
  });
  const expiry = dateLabel(view.expiresAtMs);

  return (
    <>
      <section className="rounded-3xl bg-surface p-5" data-testid="shared-esim-open">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-success" aria-hidden="true" />
          <h1 className="text-xl font-bold">eSIM siap dipasang</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {view.packageName} · {view.locationCodes.join(" · ") || "Regional"}
        </p>

        <div className="mt-4">
          <EsimInstallPanel esim={{ ...view.esim, iccid: "" }} compact withGuide />
        </div>

        <div className="mt-4">
          <p className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
            Atau masukkan manual
          </p>
          <ManualDetails esim={{ ...view.esim, iccid: "" }} />
        </div>

        <div className="mt-3 grid grid-cols-3 rounded-2xl bg-secondary/60 py-3">
          <div className="border-r border-border text-center">
            <small className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              Durasi
            </small>
            <b className="text-[13px]">
              {view.durationDays > 0 ? `${view.durationDays} hari` : "Paket"}
            </b>
          </div>
          <div className="border-r border-border text-center">
            <small className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              Kuota
            </small>
            <b className="text-[13px]">{quotaLabel(view.quotaBytes, view.unlimited)}</b>
          </div>
          <div className="text-center">
            <small className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              Status
            </small>
            <b className="text-[13px]">{view.installed ? "Terpasang" : "Siap"}</b>
          </div>
        </div>
        {expiry && (
          <p className="mt-3 text-center text-[12px] text-muted-foreground">
            Berlaku sampai {expiry}
          </p>
        )}
      </section>

      <div className="mt-3">
        <TravelUsageCard view={usageReport} />
      </div>

      <p className="mt-3 flex items-start gap-2 px-1 text-[12px] leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        Link ini terikat ke browser ini. Jangan bagikan halaman ini ke orang lain; QR dan kode
        aktivasi hanya untuk perangkat yang akan memakai eSIM.
      </p>
    </>
  );
}
