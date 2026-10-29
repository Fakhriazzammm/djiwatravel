import { useEffect, useState, type FormEvent } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ArrowRight, LoaderCircle, LogOut, RefreshCw } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { clearTravelLocalData } from "@/lib/travel-local-data";
import { signOutBetterAuth } from "@/lib/better-auth-client";
import { isLocalDevelopmentHost } from "@/lib/local-development";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";
import {
  isCustomerProfileComplete,
  validateCustomerProfile,
  type CustomerProfileDraft,
} from "@/lib/customer-profile";
import {
  CUSTOMER_PROFILE_UPDATED_EVENT,
  loadCustomerProfile,
  saveCustomerProfile,
} from "@/lib/customer-profile-client";

type ProfileStatus = "idle" | "loading" | "incomplete" | "complete" | "error";

const emptyProfile: CustomerProfileDraft = { email: "", whatsapp: "" };

export function CustomerOnboardingGate() {
  const { user, setUser, loading: authLoading } = useBetterAuthUser();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>("loading");
  const [profile, setProfile] = useState<CustomerProfileDraft>(emptyProfile);
  const [profileError, setProfileError] = useState("");
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const isLocalDevelopment =
    typeof window !== "undefined" && isLocalDevelopmentHost(window.location.hostname);
  const open = Boolean(
    user && !authLoading && !isAdminRoute && !isLocalDevelopment && profileStatus !== "complete",
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setProfileStatus("idle");
      setProfile(emptyProfile);
      setProfileError("");
      return;
    }

    let active = true;
    setProfileStatus("loading");
    setProfileError("");
    void loadCustomerProfile()
      .then((saved) => {
        if (!active) return;
        const nextProfile = {
          email: user.email ?? saved?.email ?? "",
          whatsapp: saved?.whatsapp ?? "",
        };
        setProfile(nextProfile);
        setProfileStatus(isCustomerProfileComplete(nextProfile) ? "complete" : "incomplete");
      })
      .catch(() => {
        if (!active) return;
        setProfile({ email: user.email ?? "", whatsapp: "" });
        setProfileStatus("error");
      });

    return () => {
      active = false;
    };
  }, [authLoading, retry, user]);

  useEffect(() => {
    const onProfileUpdated = (event: Event) => {
      const saved = (event as CustomEvent<CustomerProfileDraft>).detail;
      if (!saved) return;
      setProfile(saved);
      setProfileStatus("complete");
      setProfileError("");
    };
    window.addEventListener(CUSTOMER_PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => window.removeEventListener(CUSTOMER_PROFILE_UPDATED_EVENT, onProfileUpdated);
  }, []);

  const submitProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError("");
    const errors = validateCustomerProfile(profile);
    if (Object.keys(errors).length > 0) {
      setProfileError(errors.email || errors.whatsapp || "Periksa kembali datamu.");
      return;
    }

    setSaving(true);
    try {
      await saveCustomerProfile(profile);
      setProfileStatus("complete");
    } catch (error) {
      setProfileError(
        error instanceof Error
          ? error.message
          : "Data belum tersimpan. Periksa koneksi lalu coba lagi.",
      );
    } finally {
      setSaving(false);
    }
  };

  const logout = async () => {
    setLoggingOut(true);
    setProfileError("");
    try {
      await signOutBetterAuth();
      clearTravelLocalData();
      setUser(null);
      window.location.assign("/");
    } catch {
      setProfileError("Logout belum berhasil. Coba lagi.");
      setLoggingOut(false);
    }
  };

  return (
    <Sheet open={open}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="z-[70] max-h-[90dvh] overflow-y-auto rounded-t-[28px] border-border bg-background px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-6 sm:left-1/2 sm:right-auto sm:w-[min(100%,30rem)] sm:-translate-x-1/2 sm:rounded-t-[28px]"
        aria-describedby="customer-onboarding-description"
      >
        {profileStatus === "loading" || profileStatus === "idle" ? (
          <>
            <div className="flex min-h-44 flex-col items-center justify-center gap-3 text-center">
              <LoaderCircle className="size-7 animate-spin text-brand-red" aria-hidden="true" />
              <SheetTitle>Menyiapkan akunmu…</SheetTitle>
              <SheetDescription id="customer-onboarding-description">
                Memeriksa data profil sebelum melanjutkan.
              </SheetDescription>
            </div>
            <button
              type="button"
              disabled={loggingOut}
              onClick={() => void logout()}
              className="tap mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-muted-foreground transition hover:bg-secondary disabled:opacity-60"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {loggingOut ? "Keluar dari akun…" : "Logout"}
            </button>
          </>
        ) : (
          <>
            <SheetHeader className="pr-2 text-left">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-red">
                Satu langkah lagi
              </p>
              <SheetTitle className="pt-1 text-2xl tracking-tight">Lengkapi profilmu</SheetTitle>
              <SheetDescription id="customer-onboarding-description" className="max-w-sm pt-1">
                Kami memakai data ini untuk mengirim detail pesanan dan eSIM. Lengkapi dulu untuk
                melanjutkan menggunakan Djiwa Travel.
              </SheetDescription>
            </SheetHeader>

            {profileStatus === "error" ? (
              <div className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
                <p role="alert" className="text-sm text-destructive">
                  Profil belum bisa diperiksa. Cek koneksi internet lalu coba lagi.
                </p>
                <button
                  type="button"
                  onClick={() => setRetry((value) => value + 1)}
                  className="tap mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-red px-4 text-sm font-bold text-white"
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                  Coba lagi
                </button>
              </div>
            ) : (
              <form onSubmit={(event) => void submitProfile(event)} className="mt-5 space-y-4">
                <div className="space-y-2">
                  <label htmlFor="onboarding-email" className="text-sm font-semibold">
                    Email akun
                  </label>
                  <input
                    id="onboarding-email"
                    type="email"
                    value={profile.email}
                    readOnly
                    autoComplete="email"
                    className="h-12 w-full rounded-xl border border-border bg-secondary/60 px-4 text-[16px] text-muted-foreground outline-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Email mengikuti akun yang kamu gunakan.
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="onboarding-whatsapp" className="text-sm font-semibold">
                    Nomor WhatsApp
                  </label>
                  <input
                    id="onboarding-whatsapp"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    autoFocus
                    value={profile.whatsapp}
                    onChange={(event) => setProfile({ ...profile, whatsapp: event.target.value })}
                    placeholder="0851 5639 9831"
                    aria-invalid={Boolean(profileError)}
                    aria-describedby="onboarding-whatsapp-hint"
                    className="h-12 w-full rounded-xl border border-border bg-surface px-4 text-[16px] outline-none transition focus:border-brand-red focus:ring-2 focus:ring-brand-red/20"
                  />
                  <p id="onboarding-whatsapp-hint" className="text-xs text-muted-foreground">
                    Boleh diawali 08 atau +62. Nomor disimpan dalam format +62.
                  </p>
                </div>

                {profileError && (
                  <p role="alert" className="text-sm text-destructive">
                    {profileError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={saving || loggingOut}
                  className="tap flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-red px-4 text-sm font-bold text-white shadow-md shadow-brand-red/20 transition hover:brightness-95 active:scale-[0.99] disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      Menyimpan data…
                    </>
                  ) : (
                    <>
                      Simpan dan lanjutkan
                      <ArrowRight className="size-4" aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>
            )}

            {profileError && profileStatus === "error" && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {profileError}
              </p>
            )}

            <button
              type="button"
              disabled={saving || loggingOut}
              onClick={() => void logout()}
              className="tap mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-muted-foreground transition hover:bg-secondary disabled:opacity-60"
            >
              <LogOut className="size-4" aria-hidden="true" />
              {loggingOut ? "Keluar dari akun…" : "Logout"}
            </button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
