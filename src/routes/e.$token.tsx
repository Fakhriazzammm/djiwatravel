import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, CircleAlert, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { Page, Wordmark, btnSoft } from "@/components/shell";
import { CustomerAuth } from "@/components/customer-auth";
import { ClaimPreviewCard, OpenEsimCard, StateCard } from "@/components/esim-share/share-views";
import { TravelUsageCard } from "@/components/travel-usage-card";
import { claimSharedEsim, getSharedEsim } from "@/lib/esim-share.fn";
import type { SharedEsimLanding, SharedEsimView } from "@/lib/esim-share";
import { usageView } from "@/lib/travel-journey";
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

function SharedEsimPage() {
  const { token } = Route.useParams();
  const initial = Route.useLoaderData();
  const { user, setUser, loading: authLoading } = useBetterAuthUser();
  const reduceMotion = Boolean(useReducedMotion());
  const [landing, setLanding] = useState<SharedEsimLanding>(initial);
  const [claiming, setClaiming] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [justClaimed, setJustClaimed] = useState(false);

  async function claim() {
    if (!user || authLoading) return;
    setClaiming(true);
    setError(null);
    try {
      const next = await claimSharedEsim({ data: { token } });
      setJustClaimed(next.state === "open");
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

  const recheckAccess = useCallback(async () => {
    setCheckingAccess(true);
    setAccessError(null);
    try {
      setLanding(await getSharedEsim({ data: { token } }));
    } catch {
      setAccessError("Akses belum bisa diperiksa. Periksa koneksi lalu coba lagi.");
    } finally {
      setCheckingAccess(false);
    }
  }, [token]);

  useEffect(() => {
    if (
      (landing.state === "claim_check_failed" || landing.state === "claimed_elsewhere") &&
      !authLoading &&
      user
    ) {
      void recheckAccess();
    }
  }, [landing.state, authLoading, user, recheckAccess]);

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
              title="Link tidak tersedia"
              detail="Link mungkin sudah dicabut atau masa aktif eSIM sudah berakhir. Minta pengirim membuat link baru."
              tips={[
                "Hmm, link ini sudah tidak bisa dibuka.",
                "Minta pengirim membuat link baru dari halaman pesanannya. Prosesnya cepat.",
              ]}
            >
              <p className="mt-3 flex items-start gap-2 text-[12px] leading-5 text-muted-foreground">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-brand-red" aria-hidden="true" />
                Data eSIM tidak pernah ditampilkan di link yang sudah tidak berlaku.
              </p>
            </StateCard>
          </motion.div>
        )}

        {landing.state === "claimed_elsewhere" && (
          <motion.div key="claimed" {...entrance}>
            <StateCard
              title="eSIM ini sudah diklaim akun lain"
              detail={
                user
                  ? "Masuklah dengan akun Djiwa Travel yang pertama kali mengklaim eSIM ini. Klaim lama yang masih terikat ke browser mungkin perlu link baru dari pengirim."
                  : "Masuk dengan akun Djiwa Travel milik penerima. Jika link lama masih terikat ke browser, minta pengirim membuat link baru."
              }
              tips={[
                "Hanya akun yang mengklaim eSIM ini yang bisa melihat QR dan kode pemasangan.",
                "Coba masuk dengan akun lain yang kamu pakai untuk Djiwa Travel.",
              ]}
            >
              {user && (
                <button
                  type="button"
                  onClick={() => void recheckAccess()}
                  disabled={checkingAccess}
                  className={`${btnSoft} mt-3 w-full`}
                >
                  {checkingAccess ? (
                    <Loader2
                      className={`size-4 ${reduceMotion ? "" : "animate-spin"}`}
                      aria-hidden="true"
                    />
                  ) : (
                    <ShieldCheck className="size-4" aria-hidden="true" />
                  )}
                  Coba periksa lagi
                </button>
              )}
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
              {accessError && (
                <p role="alert" className="mt-3 text-sm text-brand-red">
                  {accessError}
                </p>
              )}
            </StateCard>
          </motion.div>
        )}

        {landing.state === "claim_check_failed" && (
          <motion.div key="claim-check-failed" {...entrance}>
            <StateCard
              title="Akses eSIM belum bisa diperiksa"
              detail="Layanan sesi sedang tidak stabil. QR dan kode pemasangan tetap terlindungi; coba periksa lagi sebentar."
              tips={[
                "Koneksi ke layanan sesi sedang ngadat. Tenang, eSIM-mu aman.",
                "Ketuk “Coba periksa lagi” beberapa detik lagi.",
              ]}
            >
              {!authLoading && !user && (
                <div className="mt-3">
                  <CustomerAuth label="Masuk untuk memeriksa akses" />
                </div>
              )}
              <button
                type="button"
                onClick={() => void recheckAccess()}
                disabled={checkingAccess}
                className={`${btnSoft} mt-3 w-full`}
              >
                {checkingAccess ? (
                  <Loader2
                    className={`size-4 ${reduceMotion ? "" : "animate-spin"}`}
                    aria-hidden="true"
                  />
                ) : (
                  <ShieldCheck className="size-4" aria-hidden="true" />
                )}
                Coba periksa lagi
              </button>
              {accessError && (
                <p role="alert" className="mt-3 text-sm text-brand-red">
                  {accessError}
                </p>
              )}
            </StateCard>
          </motion.div>
        )}

        {landing.state === "available" && (
          <motion.div key="available" {...entrance}>
            <ClaimPreviewCard
              preview={landing.preview}
              signedIn={Boolean(user)}
              authLoading={authLoading}
              claiming={claiming}
              error={Boolean(error)}
              onClaim={() => void claim()}
            />
          </motion.div>
        )}

        {landing.state === "open" && (
          <motion.div key="open" {...entrance}>
            <OpenEsim view={landing.view} justClaimed={justClaimed} />
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

function OpenEsim({ view, justClaimed }: { view: SharedEsimView; justClaimed: boolean }) {
  const usage = view.usage;
  const usageReport = usageView({
    volumeBytes: usage?.totalBytes ?? view.quotaBytes,
    usedGb: usage ? usage.usedBytes / 1_000_000_000 : null,
    measuredAt: usage?.measuredAt ?? null,
    unlimited: view.unlimited,
    active: true,
    lowPercent: 20,
  });
  return (
    <>
      <OpenEsimCard view={view} justClaimed={justClaimed} />
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
