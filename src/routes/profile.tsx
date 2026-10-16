import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronRight, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { signOutBetterAuth } from "@/lib/better-auth-client";
import { clearTravelLocalData } from "@/lib/travel-local-data";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";
import { Page, Wordmark, group, row, label } from "@/components/shell";
import { CustomerAuth } from "@/components/customer-auth";
import { claimGuestOrders, useOrders } from "@/lib/orders";
import { rupiah } from "@/lib/pricing";
import { validateCustomerProfile, type CustomerProfileDraft } from "@/lib/customer-profile";
import { loadCustomerProfile, saveCustomerProfile } from "@/lib/customer-profile-client";
import { DjiwaPayTopup } from "@/components/djiwa-pay-topup";
import { ACTION_STAGES, useStagedLabel } from "@/lib/progress-stages";

export const Route = createFileRoute("/profile")({
  validateSearch: (search: Record<string, unknown>) => ({
    admin: search.admin === "unauthorized" ? "unauthorized" as const : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Profil — Djiwa Travel" },
      { name: "description", content: "Akun, riwayat pesanan, dan bantuan Djiwa Travel." },
      { property: "og:title", content: "Profil — Djiwa Travel" },
      { property: "og:description", content: "Akun, riwayat pesanan, dan bantuan Djiwa Travel." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Profile,
});

function Profile() {
  const { admin } = Route.useSearch();
  const orders = useOrders() ?? [];
  const item = row;
  const { user, setUser, loading } = useBetterAuthUser();
  const [profile, setProfile] = useState<CustomerProfileDraft>({ email: "", whatsapp: "" });
  const [profileSaved, setProfileSaved] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const profileSaveLabel = useStagedLabel(savingProfile, ACTION_STAGES.profileSave);
  const [profileError, setProfileError] = useState<string | null>(null);
  // Guest orders bought on this device are imported once the customer signs in, so the same account
  // sees them on every other device too.
  const [claimingOrders, setClaimingOrders] = useState(false);
  const [claimedCount, setClaimedCount] = useState(0);
  useEffect(() => {
    if (!user) {
      setClaimedCount(0);
      return;
    }
    let active = true;
    setClaimingOrders(true);
    void claimGuestOrders()
      .then((result) => {
        if (active) setClaimedCount(result.claimed);
      })
      .catch(() => {
        // A failed import must not block the profile page; the next visit retries it.
        if (active) setClaimedCount(0);
      })
      .finally(() => {
        if (active) setClaimingOrders(false);
      });
    return () => {
      active = false;
    };
  }, [user]);
  useEffect(() => {
    if (!user) {
      setProfileSaved(false);
      setEditingProfile(false);
      return;
    }
    void loadCustomerProfile()
      .then((saved) => {
        setProfile(saved ?? { email: user.email ?? "", whatsapp: "" });
        setProfileSaved(Boolean(saved));
      })
      .catch(() => {
        setProfile({ email: user.email ?? "", whatsapp: "" });
        setProfileSaved(false);
      });
  }, [user]);
  const submitProfile = async () => {
    const errors = validateCustomerProfile(profile);
    if (Object.keys(errors).length > 0) {
      setProfileError(errors.email || errors.whatsapp || "Periksa kembali datamu.");
      return;
    }
    setSavingProfile(true);
    try {
      await saveCustomerProfile(profile);
      setProfileSaved(true);
      setEditingProfile(false);
      setProfileError(null);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Data belum tersimpan. Coba lagi.");
    } finally {
      setSavingProfile(false);
    }
  };
  return (
    <Page>
      <h1 className="large-title pt-4">Profil</h1>
      {admin === "unauthorized" && (
        <div role="alert" className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Area admin membutuhkan akun admin yang diizinkan. Kamu tetap berada di area traveler.
        </div>
      )}
      <div className="mt-4 rounded-2xl bg-surface p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-xl font-semibold">
            {loading ? "…" : user?.name?.slice(0, 1).toUpperCase() || "T"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{loading ? "Memuat akun…" : user?.name || "Traveler"}</p>
            <p className="text-sm text-muted-foreground">
              {loading ? "Mohon tunggu sebentar" : user?.email || "Masuk untuk menyimpan pesananmu"}
            </p>
          </div>
          {user ? (
            <button
              type="button"
              className="tap inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-black/[0.08] bg-background px-2.5 text-xs font-semibold text-muted-foreground"
              aria-label="Logout"
              onClick={() => {
                void signOutBetterAuth().then(() => {
                  // Sign-out is the moment another customer could pick up this device.
                  clearTravelLocalData();
                  setUser(null);
                });
              }}
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span>Logout</span>
            </button>
          ) : null}
        </div>
        {!loading && !user && (
          <div className="mt-4">
            <CustomerAuth onAuthenticated={setUser} />
          </div>
        )}
        {user && (!profileSaved || editingProfile) && (
          <div className="mt-5 border-t pt-4">
            <p className="font-semibold">Lengkapi data pengiriman</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Email dan WhatsApp dipakai untuk mengirim detail pesanan dan tagihan.
            </p>
            <div className="mt-3 space-y-2">
              <input
                aria-label="Email pengiriman"
                type="email"
                inputMode="email"
                value={profile.email}
                onChange={(event) => setProfile({ ...profile, email: event.target.value })}
                placeholder="Email"
                className="h-12 w-full rounded-xl bg-secondary px-4 outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                aria-label="Nomor WhatsApp"
                type="tel"
                inputMode="tel"
                value={profile.whatsapp}
                onChange={(event) => setProfile({ ...profile, whatsapp: event.target.value })}
                placeholder="Nomor WhatsApp (62…)"
                className="h-12 w-full rounded-xl bg-secondary px-4 outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {profileError && (
              <p role="alert" className="mt-2 text-sm text-destructive">
                {profileError}
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={savingProfile}
                onClick={submitProfile}
                className="h-11 flex-1 rounded-xl bg-primary font-semibold text-primary-foreground disabled:opacity-50"
              >
                {savingProfile ? profileSaveLabel : "Simpan data"}
              </button>
              {profileSaved && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingProfile(false);
                    setProfileError(null);
                  }}
                  className="h-11 rounded-xl bg-secondary px-4 font-semibold"
                >
                  Batal
                </button>
              )}
            </div>
          </div>
        )}
        {user && profileSaved && !editingProfile && (
          <div className="mt-4 flex items-center gap-2">
            <p className="flex flex-1 items-center gap-2 text-sm text-success">
              <Check className="size-4" /> Data pengiriman tersimpan
            </p>
            <button
              type="button"
              onClick={() => {
                setEditingProfile(true);
                setProfileError(null);
              }}
              className="tap text-sm font-semibold text-brand-red"
            >
              Ubah
            </button>
          </div>
        )}
        {user && <DjiwaPayTopup userId={user.id} />}
      </div>

      <h2 className={`${label} mt-6`}>Riwayat Pesanan</h2>
      {claimingOrders && (
        <p className="px-1 pb-2 text-xs text-muted-foreground">Menyiapkan riwayat pesananmu…</p>
      )}
      {!claimingOrders && claimedCount > 0 && (
        <p className="px-1 pb-2 text-xs text-success">
          {claimedCount} pesanan berhasil disimpan ke akunmu.
        </p>
      )}
      <div className={group}>
        {orders.length === 0 && (
          <p className="px-4 py-3.5 text-muted-foreground">Belum ada pesanan.</p>
        )}
        {orders.map((o) => {
          return (
            <Link key={o.id} to="/order/$id" params={{ id: o.id }} className={item}>
              <span className="min-w-0 truncate text-[14px]">
                🌐 {o.packageName ?? o.packageId}{" "}
                <span className="text-[12px] text-muted-foreground">
                  #{o.publicOrderCode ?? o.id.slice(0, 8)}
                </span>
              </span>
              <span className="text-sm text-muted-foreground">{rupiah(o.amount)}</span>
            </Link>
          );
        })}
      </div>

      <div className={`${group} mt-6`}>
        {["Bantuan", "Syarat & Ketentuan", "Kebijakan Privasi"].map((l) => (
          <div key={l} className={item}>
            <span className="text-[14px]">{l}</span>
            <ChevronRight className="size-5 text-muted-foreground" />
          </div>
        ))}
      </div>

      <div className="mt-12 text-center">
        <Wordmark className="mx-auto h-16" />
        <p className="mt-1 text-sm text-muted-foreground">Bawa Djiwamu Lebih Jauh.</p>
      </div>
    </Page>
  );
}
