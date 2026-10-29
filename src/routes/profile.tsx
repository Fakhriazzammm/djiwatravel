import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Check, ChevronRight, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { signOutBetterAuth } from "@/lib/better-auth-client";
import { clearTravelLocalData } from "@/lib/travel-local-data";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";
import { Page, Wordmark, group, row, label } from "@/components/shell";
import { CustomerAuth } from "@/components/customer-auth";
import { useOrders } from "@/lib/orders";
import { effectiveOrderStatus, ORDER_STATUS_LABEL } from "@/lib/esim-status";
import { rupiah } from "@/lib/pricing";
import { validateCustomerProfile, type CustomerProfileDraft } from "@/lib/customer-profile";
import {
  CUSTOMER_PROFILE_UPDATED_EVENT,
  loadCustomerProfile,
  saveCustomerProfile,
} from "@/lib/customer-profile-client";
import { ACTION_STAGES, useStagedLabel } from "@/lib/progress-stages";
import { isSafeTripReturnTo } from "@/lib/trip-actions";

export const Route = createFileRoute("/profile")({
  validateSearch: (search: Record<string, unknown>) => ({
    admin: search["admin"] === "unauthorized" ? ("unauthorized" as const) : undefined,
    returnTo: isSafeTripReturnTo(search["returnTo"]) ? search["returnTo"] : undefined,
    calendar: ["connected", "failed", "denied"].includes(String(search["calendar"]))
      ? (search["calendar"] as "connected" | "failed" | "denied")
      : undefined,
    calendarSync: search["sync"] === "failed" ? ("failed" as const) : undefined,
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
  const { admin, returnTo, calendar, calendarSync } = Route.useSearch();
  const orders = useOrders() ?? [];
  const item = row;
  const { user, setUser, loading } = useBetterAuthUser();
  const [profile, setProfile] = useState<CustomerProfileDraft>({ email: "", whatsapp: "" });
  const [profileSaved, setProfileSaved] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const profileSaveLabel = useStagedLabel(savingProfile, ACTION_STAGES.profileSave);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarAccount, setCalendarAccount] = useState<string | null>(null);
  const [calendarPendingCount, setCalendarPendingCount] = useState(0);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarStatusLoading, setCalendarStatusLoading] = useState(true);
  const [calendarStatusError, setCalendarStatusError] = useState(false);
  const [calendarSyncResolved, setCalendarSyncResolved] = useState(false);
  const [calendarSyncFeedback, setCalendarSyncFeedback] = useState<{
    kind: "success" | "warning" | "error";
    message: string;
  } | null>(null);
  const [orderFilter, setOrderFilter] = useState<"ALL" | "PENDING" | "READY" | "TERMINAL">("ALL");
  const filteredOrders = orders.filter((o) => {
    const status = effectiveOrderStatus(o.status, o.expiresAt);
    if (orderFilter === "READY") return status === "READY" || status === "INSTALLED";
    if (orderFilter === "TERMINAL")
      return ["EXPIRED", "REFUNDED", "CANCELLED", "PROVISIONING_FAILED"].includes(status);
    if (orderFilter === "PENDING")
      return ![
        "READY",
        "INSTALLED",
        "EXPIRED",
        "REFUNDED",
        "CANCELLED",
        "PROVISIONING_FAILED",
      ].includes(status);
    return true;
  });
  useEffect(() => {
    if (!loading && user && returnTo) window.location.replace(returnTo);
  }, [loading, returnTo, user]);
  useEffect(() => {
    if (!user) {
      setProfileSaved(false);
      setEditingProfile(false);
      setCalendarConnected(false);
      setCalendarAccount(null);
      setCalendarStatusLoading(false);
      setCalendarStatusError(false);
      return;
    }
    setCalendarStatusLoading(true);
    setCalendarStatusError(false);
    setCalendarConnected(false);
    setCalendarAccount(null);
    void fetch("/api/google-calendar/status", { credentials: "include" })
      .then((response) => {
        if (!response.ok) throw new Error("Status Calendar tidak tersedia");
        return response.json();
      })
      .then(
        (
          status: {
            connected?: boolean;
            accountEmail?: string | null;
            pendingCount?: number;
          } | null,
        ) => {
          setCalendarConnected(Boolean(status?.connected));
          setCalendarAccount(status?.accountEmail ?? null);
          setCalendarPendingCount(Number(status?.pendingCount ?? 0));
        },
      )
      .catch(() => setCalendarStatusError(true))
      .finally(() => setCalendarStatusLoading(false));
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
  useEffect(() => {
    const onProfileUpdated = (event: Event) => {
      const saved = (event as CustomEvent<CustomerProfileDraft>).detail;
      if (!saved) return;
      setProfile(saved);
      setProfileSaved(true);
      setEditingProfile(false);
      setProfileError(null);
    };
    window.addEventListener(CUSTOMER_PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => window.removeEventListener(CUSTOMER_PROFILE_UPDATED_EVENT, onProfileUpdated);
  }, []);
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
  const calendarSyncIssue =
    !calendarSyncResolved &&
    calendarConnected &&
    (calendarPendingCount > 0 || calendarSync === "failed" || calendar === "failed");
  const calendarMessage =
    calendarSyncFeedback?.message ??
    (calendarSyncIssue
      ? calendarPendingCount > 0
        ? `${calendarPendingCount} agenda belum tersinkron ke Google Calendar.`
        : "Google Calendar terhubung, tetapi sebagian agenda belum tersinkron."
      : calendar === "failed"
        ? "Koneksi Google Calendar belum berhasil. Coba hubungkan lagi."
        : calendar === "denied"
          ? "Koneksi dibatalkan. Agenda trip tetap tersimpan di Djiwa Travel."
          : calendar === "connected"
            ? "Google Calendar berhasil dihubungkan."
            : null);
  const calendarMessageKind =
    calendarSyncFeedback?.kind ??
    (calendarSyncIssue
      ? "warning"
      : calendar === "failed"
        ? "error"
        : calendar === "connected"
          ? "success"
          : "warning");
  const retryCalendarSync = async () => {
    setCalendarBusy(true);
    setCalendarSyncFeedback(null);
    try {
      const response = await fetch("/api/google-calendar/sync", {
        method: "POST",
        credentials: "include",
      });
      const result = (await response.json()) as {
        total?: number;
        synced?: number;
        failed?: number;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "Sinkronisasi belum berhasil. Coba lagi.");
      setCalendarSyncResolved((result.failed ?? 0) === 0);
      setCalendarPendingCount(result.failed ?? 0);
      setCalendarSyncFeedback(
        result.failed
          ? {
              kind: "warning",
              message: `${result.failed} dari ${result.total} agenda belum tersinkron. Coba lagi nanti.`,
            }
          : {
              kind: "success",
              message: result.total
                ? `${result.synced} agenda berhasil disinkronkan.`
                : "Belum ada agenda trip untuk disinkronkan.",
            },
      );
    } catch (error) {
      setCalendarSyncResolved(false);
      setCalendarSyncFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Sinkronisasi belum berhasil. Coba lagi.",
      });
    } finally {
      setCalendarBusy(false);
    }
  };
  const disconnectCalendar = async () => {
    setCalendarBusy(true);
    try {
      const response = await fetch("/api/google-calendar/disconnect", {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Koneksi belum berhasil diputus. Coba lagi.");
      setCalendarConnected(false);
      setCalendarAccount(null);
      setCalendarPendingCount(0);
      setCalendarSyncFeedback({ kind: "success", message: "Google Calendar sudah diputus." });
    } catch (error) {
      setCalendarSyncFeedback({
        kind: "error",
        message: error instanceof Error ? error.message : "Koneksi belum berhasil diputus.",
      });
    } finally {
      setCalendarBusy(false);
    }
  };
  return (
    <Page>
      <h1 className="large-title pt-4">Profil</h1>
      {admin === "unauthorized" && (
        <div
          role="alert"
          className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
        >
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
      </div>

      <section
        aria-labelledby="travel-calendar-heading"
        className="mt-5 overflow-hidden rounded-2xl bg-surface"
      >
        <div className="flex items-center gap-3 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-brand-red-soft text-brand-red">
            <CalendarDays className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="travel-calendar-heading" className="text-sm font-semibold">
              Google Calendar
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Agenda perjalanan disinkronkan otomatis.
            </p>
            {!calendarStatusLoading && calendarConnected && (
              <>
                <p className="mt-1 truncate text-xs font-medium text-success">
                  Terhubung{calendarAccount ? ` · ${calendarAccount}` : ""}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Event yang sudah tersinkron tetap ada jika koneksi diputus.
                </p>
              </>
            )}
          </div>
        </div>
        <div className="space-y-3 border-t border-border/60 px-4 py-3">
          {!calendarStatusLoading && calendarMessage && (
            <p
              role={calendarMessageKind === "error" ? "alert" : "status"}
              className={`text-xs ${calendarMessageKind === "success" ? "text-success" : calendarMessageKind === "error" ? "text-destructive" : "text-amber-700"}`}
            >
              {calendarMessage}
            </p>
          )}
          {calendarStatusLoading ? (
            <p className="text-xs text-muted-foreground">Memeriksa koneksi…</p>
          ) : !user ? (
            <p className="text-xs text-muted-foreground">Masuk untuk menghubungkan kalender.</p>
          ) : calendarStatusError ? (
            <p role="alert" className="text-xs text-destructive">
              Status kalender belum tersedia. Muat ulang halaman untuk mencoba lagi.
            </p>
          ) : calendarConnected ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              {calendarSyncIssue && (
                <button
                  type="button"
                  disabled={calendarBusy}
                  onClick={() => void retryCalendarSync()}
                  className="tap min-h-10 rounded-full bg-brand-red px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {calendarBusy ? "Menyinkronkan…" : "Coba sinkronkan lagi"}
                </button>
              )}
              <button
                type="button"
                disabled={calendarBusy}
                onClick={() => void disconnectCalendar()}
                className="tap min-h-10 rounded-full px-3 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                {calendarBusy ? "Memproses…" : "Putuskan"}
              </button>
            </div>
          ) : (
            <a
              href="/api/google-calendar/connect"
              className="tap flex min-h-11 items-center justify-center rounded-full bg-brand-red px-4 text-sm font-semibold text-white"
            >
              Hubungkan Google Calendar
            </a>
          )}
        </div>
      </section>

      <h2 className={`${label} mt-6`}>Riwayat Pesanan</h2>
      <div
        className="mt-3 grid grid-cols-4 gap-1 rounded-xl bg-secondary p-1"
        role="group"
        aria-label="Filter status pesanan"
      >
        {(["ALL", "PENDING", "READY", "TERMINAL"] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            aria-pressed={orderFilter === filter}
            onClick={() => setOrderFilter(filter)}
            className={`rounded-lg px-2 py-2 text-xs font-semibold ${orderFilter === filter ? "bg-background shadow-sm" : "text-muted-foreground"}`}
          >
            {filter === "ALL"
              ? "Semua"
              : filter === "PENDING"
                ? "Menunggu"
                : filter === "READY"
                  ? "Siap"
                  : "Selesai"}
          </button>
        ))}
      </div>
      <div className={group}>
        {filteredOrders.length === 0 && (
          <p className="px-4 py-3.5 text-muted-foreground">Belum ada pesanan.</p>
        )}
        {filteredOrders.map((o) => {
          return (
            <Link key={o.id} to="/order/$id" params={{ id: o.id }} className={item}>
              <span className="min-w-0 truncate text-[14px]">
                🌐 {o.packageName ?? o.packageId}{" "}
                <span className="text-[12px] text-muted-foreground">
                  #{o.publicOrderCode ?? o.id.slice(0, 8)}
                </span>
              </span>
              <span className="text-right text-xs text-muted-foreground">
                <span className="block">{rupiah(o.amount)}</span>
                {ORDER_STATUS_LABEL[effectiveOrderStatus(o.status, o.expiresAt)]}
              </span>
            </Link>
          );
        })}
      </div>

      <nav aria-label="Bantuan dan kebijakan" className={`${group} mt-6`}>
        {[
          { label: "Cek status pesanan", to: "/order-status" as const },
          { label: "Bantuan", to: "/support" as const },
          { label: "Syarat & Ketentuan", to: "/terms" as const },
          { label: "Kebijakan Privasi", to: "/privacy" as const },
        ].map(({ label: linkLabel, to }) => (
          <Link key={to} to={to} className={`${item} tap`}>
            <span className="text-[14px]">{linkLabel}</span>
            <ChevronRight className="size-5 text-muted-foreground" aria-hidden="true" />
          </Link>
        ))}
      </nav>

      <div className="mt-12 text-center">
        <Wordmark className="mx-auto h-16" />
        <p className="mt-1 text-sm text-muted-foreground">Bawa Djiwamu Lebih Jauh.</p>
      </div>
    </Page>
  );
}
