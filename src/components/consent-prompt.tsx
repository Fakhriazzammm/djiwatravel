import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { resetConsentCache, useConsent } from "@/hooks/use-consent";
import { ONE_TAP_PURPOSES } from "@/lib/consent";
import { CONSENT_EVENT, readConsent } from "@/lib/cookie-consent";
import { isCustomerProfileComplete } from "@/lib/customer-profile";
import { CUSTOMER_PROFILE_UPDATED_EVENT, loadCustomerProfile } from "@/lib/customer-profile-client";
import { isLocalDevelopmentHost } from "@/lib/local-development";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";

const QUIET_PATHS = ["/admin", "/privacy", "/terms", "/privasi-akun"];

/**
 * The one-time "Biar Djiwa makin pas buat kamu" sheet after sign-in or registration. It waits for
 * the profile onboarding and the cookie notice to be done, asks once (or again after 7 days if the
 * member says "Nanti saja"), and stores the answer on the account. "Setuju" turns on Komunitas,
 * Asisten (AI) and Personalisasi; Kabar & promo is never bundled in.
 */
export function ConsentPrompt() {
  const { user, loading } = useBetterAuthUser();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const consent = useConsent(Boolean(user));
  const [profileReady, setProfileReady] = useState(false);
  const [cookieDone, setCookieDone] = useState(false);
  const [settled, setSettled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastUser = useRef<string | null>(null);

  useEffect(() => {
    const id = user?.id ?? null;
    if (lastUser.current !== id) {
      if (lastUser.current !== null || id === null) resetConsentCache();
      lastUser.current = id;
      setDismissed(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    // The profile onboarding sheet is off on localhost, so there is nothing to wait for there.
    if (isLocalDevelopmentHost(window.location.hostname)) return setProfileReady(true);
    let live = true;
    const check = () =>
      void loadCustomerProfile()
        .then(
          (profile) =>
            live && setProfileReady(Boolean(profile && isCustomerProfileComplete(profile))),
        )
        .catch(() => live && setProfileReady(false));
    check();
    window.addEventListener(CUSTOMER_PROFILE_UPDATED_EVENT, check);
    return () => {
      live = false;
      window.removeEventListener(CUSTOMER_PROFILE_UPDATED_EVENT, check);
    };
  }, [user]);

  useEffect(() => {
    const sync = () => setCookieDone(readConsent() !== null);
    sync();
    window.addEventListener(CONSENT_EVENT, sync);
    return () => window.removeEventListener(CONSENT_EVENT, sync);
  }, []);

  const quiet = QUIET_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const eligible = Boolean(
    user &&
    !loading &&
    consent.loaded &&
    consent.state?.needsPrompt &&
    profileReady &&
    cookieDone &&
    !quiet &&
    !dismissed,
  );

  useEffect(() => {
    if (!eligible) {
      setSettled(false);
      return;
    }
    const timer = window.setTimeout(() => setSettled(true), 1200);
    return () => window.clearTimeout(timer);
  }, [eligible]);

  const open = eligible && settled;

  async function agree() {
    setBusy(true);
    try {
      await consent.save(
        Object.fromEntries(ONE_TAP_PURPOSES.map((purpose) => [purpose, true])),
        "prompt",
      );
      setDismissed(true);
      toast.success(
        "Terima kasih! Pilihanmu tersimpan. Ubah kapan saja di Profil › Privasi & data.",
      );
    } catch {
      toast.error("Pilihanmu belum tersimpan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function later(goToSettings = false) {
    setDismissed(true);
    await consent.snooze().catch(() => undefined);
    if (goToSettings) void navigate({ to: "/privasi-akun" });
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && void later()}>
      <SheetContent
        side="bottom"
        data-testid="consent-prompt"
        className="mx-auto w-full max-w-md rounded-t-[28px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 text-center"
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-muted-foreground/25" aria-hidden />
        <div
          aria-hidden="true"
          className="mx-auto mb-2 flex size-11 items-center justify-center rounded-full bg-brand-red-soft text-[22px]"
        >
          🤝
        </div>
        <SheetTitle className="text-[18px] font-bold tracking-tight">
          Biar Djiwa makin pas buat kamu
        </SheetTitle>
        <SheetDescription className="mx-auto mt-1 max-w-[19rem] text-[13px] leading-snug">
          Boleh kami memakai datamu agar ini terbuka untukmu?
        </SheetDescription>
        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {["👥 Feeds", "🤖 Travo AI", "✨ Saran pribadi"].map((chip) => (
            <span
              key={chip}
              className="rounded-xl bg-secondary px-2.5 py-1 text-[11.5px] font-semibold"
            >
              {chip}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void agree()}
          disabled={busy}
          className="tap mt-4 flex min-h-11 w-full items-center justify-center rounded-full bg-brand-red text-[15px] font-bold text-white disabled:opacity-50"
        >
          {busy ? "Menyimpan…" : "Setuju"}
        </button>
        <div className="mt-1 flex items-center justify-between">
          <button
            type="button"
            onClick={() => void later()}
            className="tap min-h-10 px-2 text-[12.5px] font-semibold text-muted-foreground"
          >
            Nanti saja
          </button>
          <button
            type="button"
            onClick={() => void later(true)}
            className="tap min-h-10 px-2 text-[12.5px] font-semibold text-brand-red"
          >
            Atur pilihan
          </button>
        </div>
        <p className="mt-1 text-[10.5px] text-muted-foreground">
          Ubah kapan saja di Profil › Privasi & data ·{" "}
          <a href="/privacy" className="font-semibold text-brand-red">
            Kebijakan privasi
          </a>
        </p>
      </SheetContent>
    </Sheet>
  );
}
