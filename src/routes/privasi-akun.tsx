import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CustomerAuth } from "@/components/customer-auth";
import { BackBar, Page } from "@/components/shell";
import { useConsent } from "@/hooks/use-consent";
import {
  CONSENT_DETAIL,
  CONSENT_FEATURES,
  CONSENT_LABEL,
  CONSENT_PURPOSES,
  type ConsentPurpose,
} from "@/lib/consent";
import { CONSENT_EVENT, readConsent, saveConsent } from "@/lib/cookie-consent";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";

export const Route = createFileRoute("/privasi-akun")({
  head: () => ({
    meta: [{ title: "Privasi & data — Djiwa Travel" }, { name: "robots", content: "noindex" }],
  }),
  component: PrivacyAccountPage,
});

const ICON: Record<ConsentPurpose, string> = {
  community: "👥",
  ai: "🤖",
  personalization: "✨",
  promo: "🔔",
};

function Switch({
  checked,
  label,
  busy,
  onChange,
}: {
  checked: boolean;
  label: string;
  busy?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={busy}
      onClick={() => onChange(!checked)}
      className={`tap relative mt-0.5 h-7 w-[46px] shrink-0 rounded-full transition-colors disabled:opacity-60 ${checked ? "bg-emerald-600" : "bg-muted-foreground/30"}`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-[3px] top-[3px] size-[22px] rounded-full bg-white shadow transition-transform ${checked ? "translate-x-[18px]" : ""}`}
      />
    </button>
  );
}

function PrivacyAccountPage() {
  const { user, loading } = useBetterAuthUser();
  const consent = useConsent(Boolean(user));
  const [pending, setPending] = useState<ConsentPurpose | null>(null);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    const sync = () => setAnalytics(readConsent() === "all");
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  async function toggle(purpose: ConsentPurpose, next: boolean) {
    setPending(purpose);
    try {
      await consent.save({ [purpose]: next }, "settings");
      toast.success(
        next ? `${CONSENT_LABEL[purpose]} aktif.` : `${CONSENT_LABEL[purpose]} dimatikan.`,
      );
    } catch {
      toast.error("Pilihanmu belum tersimpan. Coba lagi.");
    } finally {
      setPending(null);
    }
  }

  return (
    <Page>
      <BackBar title="Privasi & data" fallbackTo="/profile" />
      <p className="mt-2 text-[13px] leading-snug text-muted-foreground">
        Kamu yang memilih. Semua mati sampai kamu menyalakannya, dan bisa diubah kapan saja. Layanan
        inti (eSIM, pesanan, tiket, Dompet, Agenda) tetap jalan tanpa persetujuan ini.
      </p>

      {loading ? (
        <p className="mt-4 text-[13px] text-muted-foreground" role="status">
          Memuat…
        </p>
      ) : !user ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-surface p-3">
          <p className="text-[13px] text-muted-foreground">
            Masuk untuk mengatur persetujuan datamu.
          </p>
          <CustomerAuth size="compact" />
        </div>
      ) : (
        <>
          <section className="mt-4 rounded-2xl bg-surface px-3" aria-label="Persetujuan data akun">
            {CONSENT_PURPOSES.map((purpose, index) => (
              <div
                key={purpose}
                className={`flex items-start gap-3 py-3 ${index > 0 ? "border-t border-border/60" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-red-soft text-[15px]"
                >
                  {ICON[purpose]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold">
                    {CONSENT_LABEL[purpose]}
                    {purpose === "promo" && (
                      <span className="ml-1.5 rounded-md bg-secondary px-1.5 py-px text-[9.5px] font-bold text-muted-foreground">
                        Opsional
                      </span>
                    )}
                  </p>
                  <p className="text-[12px] leading-snug text-muted-foreground">
                    {CONSENT_DETAIL[purpose]}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {CONSENT_FEATURES[purpose].map((feature) => (
                      <span
                        key={feature}
                        className="rounded-lg bg-secondary px-2 py-0.5 text-[10px] font-semibold"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                  {purpose === "community" && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Kalau dimatikan, postinganmu disembunyikan dari Feeds dan tampil lagi bila
                      kamu menyalakannya kembali.
                    </p>
                  )}
                </div>
                <Switch
                  checked={consent.state?.purposes[purpose] ?? false}
                  label={CONSENT_LABEL[purpose]}
                  busy={!consent.loaded || pending === purpose}
                  onChange={(next) => void toggle(purpose, next)}
                />
              </div>
            ))}
            <div className="flex items-start gap-3 border-t border-border/60 py-3">
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-red-soft text-[15px]"
              >
                📊
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">
                  Analitik & mitra
                  <span className="ml-1.5 rounded-md bg-secondary px-1.5 py-px text-[9.5px] font-bold text-muted-foreground">
                    Perangkat ini
                  </span>
                </p>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  Statistik penggunaan (Google Analytics, internal) dan skrip mitra tiket. Ini sama
                  dengan pilihan di banner cookie dan berlaku untuk perangkat ini saja.
                </p>
              </div>
              <Switch
                checked={analytics}
                label="Analitik dan mitra"
                onChange={(next) => {
                  saveConsent(next ? "all" : "essential");
                  toast.success(next ? "Analitik aktif." : "Analitik dimatikan.");
                }}
              />
            </div>
          </section>

          <details className="mt-3 rounded-2xl bg-surface p-3">
            <summary className="cursor-pointer text-[13px] font-semibold">
              Selalu aktif untuk layanan inti
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-muted-foreground">
              <li>Masuk, akun, dan profil traveler</li>
              <li>eSIM, pesanan, pembayaran (Mayar), dan struk</li>
              <li>Titip Belanja: pesanan, pesan dengan tim, pencarian dari tautan</li>
              <li>Tiket pesawat: pencarian dan tautan pemesanan</li>
              <li>Agenda, peta, dan Dompet</li>
              <li>Notifikasi pesanan dan keamanan akun</li>
            </ul>
          </details>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Sambungan Google (Kalender, Drive, Sheets) diatur lewat izin Google di fiturnya
            masing-masing.{" "}
            <Link to="/privacy" className="font-semibold text-brand-red">
              Kebijakan privasi
            </Link>
          </p>
        </>
      )}
    </Page>
  );
}
