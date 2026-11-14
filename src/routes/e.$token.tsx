import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  Loader2,
  LogOut,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { Page, Wordmark, btnRed, btnSoft, group, row } from "@/components/shell";
import { CustomerAuth } from "@/components/customer-auth";
import { EsimInstallPanel, ManualDetails } from "@/components/esim-install";
import { TravelUsageCard } from "@/components/travel-usage-card";
import { claimSharedEsim, getSharedEsim } from "@/lib/esim-share.fn";
import type { SharedEsimLanding, SharedEsimView } from "@/lib/esim-share";
import { formatGb, usageView } from "@/lib/travel-journey";
import { signOutBetterAuth } from "@/lib/better-auth-client";
import { clearTravelLocalData } from "@/lib/travel-local-data";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";

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
  const { user, setUser, loading: authLoading } = useBetterAuthUser();
  const reduceMotion = Boolean(useReducedMotion());
  const [landing, setLanding] = useState<SharedEsimLanding>(initial);
  const [claiming, setClaiming] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tipOpen, setTipOpen] = useState(false);

  async function claim() {
    if (!user || authLoading) return;
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

  async function switchAccount() {
    setSwitchingAccount(true);
    setError(null);
    try {
      await signOutBetterAuth();
      clearTravelLocalData();
      setUser(null);
    } catch {
      setError("Akun belum bisa diganti. Periksa koneksi lalu coba lagi.");
    } finally {
      setSwitchingAccount(false);
    }
  }

  const motionDuration = reduceMotion ? 0 : 0.22;
  const entrance = {
    initial: { opacity: 0, y: reduceMotion ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduceMotion ? 0 : -4 },
    transition: { duration: motionDuration, ease: "easeOut" as const },
  };

  return (
    <Page tabs={false}>
      <div className="flex items-center justify-between gap-3 pb-5 pt-4">
        <Wordmark className="h-8" />
        <span className="rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          eSIM untukmu
        </span>
      </div>

      <AnimatePresence initial={false} mode="wait">
        {landing.state === "unavailable" && (
          <motion.div key="unavailable" {...entrance}>
            <StateCard
              icon={<CircleAlert className="size-5 text-brand-red" aria-hidden="true" />}
              title="Link tidak tersedia"
              detail="Link mungkin sudah dicabut atau masa aktif eSIM sudah berakhir. Minta pengirim membuat link baru."
            />
          </motion.div>
        )}

        {landing.state === "claimed_elsewhere" && (
          <motion.div key="claimed" {...entrance}>
            <StateCard
              icon={<ShieldCheck className="size-5 text-brand-red" aria-hidden="true" />}
              title="eSIM ini sudah diklaim akun lain"
              detail={
                user
                  ? "Masuklah dengan akun Djiwa Travel yang pertama kali mengklaim eSIM ini. Klaim lama yang masih terikat ke browser mungkin perlu link baru dari pengirim."
                  : "Masuk dengan akun Djiwa Travel milik penerima. Jika link lama masih terikat ke browser, minta pengirim membuat link baru."
              }
            >
              <TravoGuide
                open={tipOpen}
                onToggle={() => setTipOpen((value) => !value)}
                tip="Hanya akun yang mengklaim eSIM ini yang bisa melihat QR dan kode pemasangan."
                reduceMotion={reduceMotion}
              />
              {authLoading ? (
                <button type="button" disabled className={`${btnSoft} mt-3 w-full`}>
                  Memeriksa akun…
                </button>
              ) : user ? (
                <button
                  type="button"
                  onClick={() => void switchAccount()}
                  disabled={switchingAccount}
                  className={`${btnSoft} mt-3 w-full`}
                >
                  {switchingAccount ? (
                    <Loader2
                      className={`size-4 ${reduceMotion ? "" : "animate-spin"}`}
                      aria-hidden="true"
                    />
                  ) : (
                    <LogOut className="size-4" aria-hidden="true" />
                  )}
                  Pakai akun lain
                </button>
              ) : (
                <div className="mt-3">
                  <CustomerAuth label="Masuk dengan akun penerima" />
                </div>
              )}
              {error && (
                <p role="alert" className="mt-3 text-sm text-brand-red">
                  {error}
                </p>
              )}
            </StateCard>
          </motion.div>
        )}

        {landing.state === "available" && (
          <motion.section
            key="available"
            {...entrance}
            className="rounded-2xl bg-surface p-4"
            data-testid="shared-esim-preview"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-2 rounded-full bg-brand-red-soft px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-red">
                  <Sparkles className="size-3.5" aria-hidden="true" /> eSIM khusus untukmu
                </span>
                <h1 className="mt-3 text-[22px] font-bold leading-tight">
                  {landing.preview.packageName}
                </h1>
                <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                  Klaim ke akunmu, lalu pasang di HP yang akan memakai eSIM dengan Wi-Fi.
                </p>
              </div>
              <TravoGuide
                open={tipOpen}
                onToggle={() => setTipOpen((value) => !value)}
                tip="Akun yang kamu pakai untuk masuk akan menyimpan akses eSIM ini. QR muncul setelah klaim berhasil."
                reduceMotion={reduceMotion}
              />
            </div>

            <dl className={`${group} mt-4`}>
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

            {authLoading ? (
              <button type="button" disabled className={`${btnSoft} mt-4 w-full`}>
                <Loader2
                  className={`size-4 ${reduceMotion ? "" : "animate-spin"}`}
                  aria-hidden="true"
                />{" "}
                Memeriksa akun…
              </button>
            ) : user ? (
              <button
                type="button"
                onClick={() => void claim()}
                disabled={claiming}
                className={`${btnRed} mt-4 w-full`}
              >
                {claiming ? (
                  <Loader2
                    className={`size-5 ${reduceMotion ? "" : "animate-spin"}`}
                    aria-hidden="true"
                  />
                ) : (
                  <Smartphone className="size-5" aria-hidden="true" />
                )}
                {claiming ? "Menyimpan ke akun…" : "Klaim eSIM ini"}
              </button>
            ) : (
              <div className="mt-4">
                <CustomerAuth label="Masuk untuk klaim" />
              </div>
            )}
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-xl bg-brand-red-soft p-3 text-sm text-brand-red"
              >
                eSIM belum bisa diklaim. Periksa koneksi lalu coba lagi.
              </p>
            )}
            <p className="mt-3 flex items-start gap-2 px-1 text-[12px] leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              Pratinjau ini tidak menampilkan QR atau data pesanan. Setelah diklaim, akun yang sama
              bisa membuka link ini dari browser lain.
            </p>
          </motion.section>
        )}

        {landing.state === "open" && (
          <motion.div key="open" {...entrance}>
            <OpenEsim
              view={landing.view}
              tipOpen={tipOpen}
              onToggleTip={() => setTipOpen((value) => !value)}
              reduceMotion={reduceMotion}
            />
          </motion.div>
        )}
      </AnimatePresence>

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

function StateCard({
  icon,
  title,
  detail,
  children,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-surface p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h1 className="text-lg font-bold">{title}</h1>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
      {children}
    </section>
  );
}

function TravoGuide({
  open,
  onToggle,
  tip,
  reduceMotion,
}: {
  open: boolean;
  onToggle: () => void;
  tip: string;
  reduceMotion: boolean;
}) {
  const duration = reduceMotion ? 0 : 0.18;
  return (
    <div className="relative z-10 shrink-0">
      <motion.button
        type="button"
        aria-label="Tanya Travo"
        aria-expanded={open}
        aria-controls="travo-esim-tip"
        onClick={onToggle}
        whileTap={reduceMotion ? undefined : { scale: 0.96 }}
        animate={open && !reduceMotion ? { rotate: [0, -4, 3, 0] } : { rotate: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.28, ease: "easeOut" }}
        className="flex min-h-11 min-w-[64px] flex-col items-center justify-center rounded-xl px-1 text-[10px] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img
          src="/assets/home-hero/mascot-v6.png"
          alt="Maskot Djiwa Travel Travo"
          className="h-10 w-14 object-contain"
          loading="eager"
        />
        Tanya Travo
      </motion.button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.p
            id="travo-esim-tip"
            initial={{ opacity: 0, y: reduceMotion ? 0 : -3, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -3, height: 0 }}
            transition={{ duration }}
            className="absolute right-0 top-full mt-1 w-[min(18rem,calc(100vw-3rem))] overflow-hidden rounded-xl border border-border bg-surface p-3 text-[12px] leading-5 text-foreground shadow-lg"
          >
            {tip}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function OpenEsim({
  view,
  tipOpen,
  onToggleTip,
  reduceMotion,
}: {
  view: SharedEsimView;
  tipOpen: boolean;
  onToggleTip: () => void;
  reduceMotion: boolean;
}) {
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
      <section
        className="rounded-2xl bg-surface p-4"
        data-testid="shared-esim-open"
        aria-live="polite"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-success" aria-hidden="true" />
              <h1 className="text-xl font-bold">eSIM siap dipasang</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {view.packageName} · {view.locationCodes.join(" · ") || "Regional"}
            </p>
          </div>
          <TravoGuide
            open={tipOpen}
            onToggle={onToggleTip}
            tip={
              view.claimMode === "account"
                ? "Akses eSIM ini tersimpan di akunmu. Buka link yang sama dari browser lain dengan akun yang sama."
                : "Link lama ini tersimpan di browser ini. Untuk memasang di perangkat lain, minta pengirim membuat link baru."
            }
            reduceMotion={reduceMotion}
          />
        </div>

        <div
          className="mt-3 flex items-center gap-2 rounded-xl bg-secondary/70 px-3 py-2.5"
          role="status"
        >
          <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
          <p className="text-[13px] font-semibold">
            {view.claimMode === "account" ? "Tersimpan di akunmu" : "Tersimpan di browser ini"}
          </p>
        </div>
        <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
          {view.claimMode === "account"
            ? "Bisa dibuka kembali dengan akun yang sama dari browser lain."
            : "Link ini terikat ke browser ini. Minta pengirim membuat link baru untuk perangkat lain."}
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
        Jangan bagikan halaman ini ke orang lain. QR dan kode aktivasi hanya untuk perangkat yang
        akan memakai eSIM.
      </p>
    </>
  );
}
