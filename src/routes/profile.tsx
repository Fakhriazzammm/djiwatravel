import { InstallAppCard } from "@/components/install-app-card";
import { PushOptInRow } from "@/components/push-opt-in-row";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { signOutBetterAuth } from "@/lib/better-auth-client";
import { clearTravelLocalData } from "@/lib/travel-local-data";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";
import { Page, Wordmark } from "@/components/shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EsimStatusBadge } from "@/components/esim-status-badge";
import { destinationArt } from "@/lib/destination-art";
import { CalendarSheet } from "@/components/profile/calendar-sheet";
import { ProfileAvatar } from "@/components/profile/profile-avatar";
import {
  ProfileServiceGrid,
  RowChevron,
  type ProfileTile,
} from "@/components/profile/profile-service-grid";
import { CustomerAuth } from "@/components/customer-auth";
import { CustomerProfileForm } from "@/components/customer-profile-form";
import { useOrders } from "@/lib/orders";
import { effectiveOrderStatus } from "@/lib/esim-status";
import { rupiah } from "@/lib/pricing";
import {
  validateCustomerProfile,
  type CustomerProfileDraft,
  type CustomerProfileErrors,
} from "@/lib/customer-profile";
import {
  CUSTOMER_PROFILE_UPDATED_EVENT,
  deleteCustomerProfile,
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
  const { user, setUser, loading } = useBetterAuthUser();
  const [profile, setProfile] = useState<CustomerProfileDraft>({ email: "", whatsapp: "" });
  const [savedProfile, setSavedProfile] = useState<CustomerProfileDraft | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const profileSaveLabel = useStagedLabel(savingProfile, ACTION_STAGES.profileSave);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileFieldErrors, setProfileFieldErrors] = useState<CustomerProfileErrors>({});
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
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!loading && user && returnTo) window.location.replace(returnTo);
  }, [loading, returnTo, user]);
  useEffect(() => {
    if (!user) {
      setProfileSaved(false);
      setSavedProfile(null);
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
        const nextProfile = saved ?? { email: user.email ?? "", whatsapp: "" };
        setProfile(nextProfile);
        setSavedProfile(saved);
        setProfileSaved(Boolean(saved));
      })
      .catch(() => {
        setProfile({ email: user.email ?? "", whatsapp: "" });
        setSavedProfile(null);
        setProfileSaved(false);
      });
  }, [user]);
  useEffect(() => {
    if (!user) {
      setUnread(0);
      return;
    }
    let active = true;
    void fetch("/api/customer-notifications?limit=1&unreadOnly=true", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { unread_count?: number } | null) => {
        if (active) setUnread(Math.max(0, Number(payload?.unread_count ?? 0)));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user]);
  useEffect(() => {
    const onProfileUpdated = (event: Event) => {
      const saved = (event as CustomEvent<CustomerProfileDraft | null>).detail;
      if (!saved) {
        setSavedProfile(null);
        setProfileSaved(false);
        setEditingProfile(false);
        return;
      }
      setProfile(saved);
      setSavedProfile(saved);
      setProfileSaved(true);
      setEditingProfile(false);
      setProfileError(null);
      setProfileFieldErrors({});
    };
    window.addEventListener(CUSTOMER_PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => window.removeEventListener(CUSTOMER_PROFILE_UPDATED_EVENT, onProfileUpdated);
  }, []);
  const submitProfile = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const errors = validateCustomerProfile(profile);
    if (Object.keys(errors).length > 0) {
      setProfileError(errors.email || errors.whatsapp || "Periksa kembali datamu.");
      setProfileFieldErrors(errors);
      return;
    }
    setSavingProfile(true);
    try {
      const saved = await saveCustomerProfile(profile);
      setProfile(saved);
      setSavedProfile(saved);
      setProfileSaved(true);
      setEditingProfile(false);
      setProfileError(null);
      setProfileFieldErrors({});
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Data belum tersimpan. Coba lagi.");
    } finally {
      setSavingProfile(false);
    }
  };
  const cancelProfileEdit = () => {
    if (savedProfile) setProfile(savedProfile);
    setEditingProfile(false);
    setProfileError(null);
    setProfileFieldErrors({});
  };
  const updateProfileField = (
    field: "displayName" | "whatsapp" | "nationality" | "dateOfBirth" | "gender",
    value: string,
  ) => {
    setProfile((current) => ({ ...current, [field]: value || null }));
    setProfileFieldErrors((current) => ({ ...current, [field]: undefined }));
    setProfileError(null);
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
  const removeProfile = async () => {
    setDeleting(true);
    try {
      await deleteCustomerProfile();
      setProfile({ email: user?.email ?? "", whatsapp: "" });
      setDetailOpen(false);
      setConfirmDelete(false);
      setProfileError(null);
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Data belum terhapus. Coba lagi.");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };
  const activeEsims = orders.filter((o) => {
    const status = effectiveOrderStatus(o.status, o.expiresAt);
    return status === "READY" || status === "INSTALLED";
  }).length;
  const calendarDetail = calendarStatusLoading
    ? "Memeriksa…"
    : !user
      ? "Masuk dulu"
      : calendarStatusError
        ? "Tidak tersedia"
        : calendarConnected
          ? calendarSyncIssue
            ? "Perlu sinkron"
            : "Terhubung"
          : "Hubungkan";
  const tiles: ProfileTile[] = [
    {
      id: "esim",
      label: "My eSIM",
      detail:
        activeEsims > 0 ? `${activeEsims} aktif` : orders.length > 0 ? "Riwayat" : "Belum ada",
    },
    { id: "trips", label: "Perjalanan", detail: "Rencana trip" },
    { id: "wallet", label: "Dompet", detail: "Djiwa Pay" },
    {
      id: "orders",
      label: "Pesanan",
      detail: orders.length > 0 ? `${orders.length} pesanan` : "Belum ada",
    },
    {
      id: "notifications",
      label: "Notifikasi",
      detail: unread > 0 ? `${unread} baru` : "Terbaru",
      ...(unread > 0 ? { badge: unread } : {}),
    },
    { id: "support", label: "Bantuan", detail: "Chat support" },
    { id: "guides", label: "Panduan", detail: "Artikel" },
    {
      id: "calendar",
      label: "Kalender",
      detail: calendarDetail,
      ...(calendarConnected && !calendarSyncIssue ? { tone: "ok" as const } : {}),
    },
  ];
  const recentOrders = orders.slice(0, 3);
  const groupClass = "overflow-hidden rounded-[20px] bg-surface";
  const rowClass =
    "tap relative flex min-h-[52px] w-full items-center gap-3 px-4 text-left text-[16px]";
  const capClass =
    "mb-2 mt-6 px-4 text-[13px] font-medium uppercase tracking-wide text-muted-foreground";
  const detailRows: Array<[string, string]> = [
    ["WhatsApp", profile.whatsapp],
    ...(profile.displayName ? [["Nama lengkap", profile.displayName] as [string, string]] : []),
    ...(profile.nationality ? [["Kewarganegaraan", profile.nationality] as [string, string]] : []),
    ...(profile.dateOfBirth ? [["Tanggal lahir", profile.dateOfBirth] as [string, string]] : []),
    ...(profile.gender
      ? [
          [
            "Jenis kelamin",
            profile.gender === "female"
              ? "Perempuan"
              : profile.gender === "male"
                ? "Laki-laki"
                : "Tidak ingin menyebutkan",
          ] as [string, string],
        ]
      : []),
  ];
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

      <section aria-label="Akun" className={`${groupClass} mt-3`}>
        <div className="flex min-h-[88px] items-center gap-3.5 px-4 py-3.5">
          <ProfileAvatar name={user?.name} image={user?.image} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[20px] font-semibold tracking-tight">
              {loading ? "Memuat akun…" : user?.name || "Traveler"}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {loading ? "Mohon tunggu sebentar" : user?.email || "Masuk untuk menyimpan pesananmu"}
            </p>
            {user && (
              <p
                className={`mt-0.5 inline-flex items-center gap-1 text-[13px] font-medium ${profileSaved ? "text-success" : "text-amber-700"}`}
              >
                {profileSaved ? (
                  <>
                    <Check className="size-3.5" aria-hidden="true" /> Profil lengkap
                  </>
                ) : (
                  "Lengkapi data profil"
                )}
              </p>
            )}
          </div>
        </div>
        {!loading && !user && (
          <div className="border-t border-border/60 p-4">
            <CustomerAuth />
          </div>
        )}
        {user && (!profileSaved || editingProfile) && (
          <div className="border-t border-border/60 p-4">
            <div className="mb-5">
              <p className="font-semibold">Data profil</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Simpan detail traveler agar perjalanan berikutnya terasa lebih ringkas.
              </p>
            </div>
            <CustomerProfileForm
              profile={profile}
              onChange={updateProfileField}
              onSubmit={(event) => void submitProfile(event)}
              onCancel={cancelProfileEdit}
              saving={savingProfile}
              saveLabel={savingProfile ? profileSaveLabel : "Simpan data"}
              error={profileError}
              errors={profileFieldErrors}
              canCancel={profileSaved}
            />
          </div>
        )}
        {user && profileSaved && !editingProfile && (
          <>
            <button
              type="button"
              aria-expanded={detailOpen}
              aria-controls="profile-detail"
              onClick={() => setDetailOpen((open) => !open)}
              className={`${rowClass} border-t border-border/60`}
            >
              <span className="flex-1">Data diri</span>
              <span className="text-[15px] text-muted-foreground">{detailRows.length} data</span>
              <ChevronDown
                className={`size-4 text-muted-foreground/60 transition-transform ${detailOpen ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
            <div id="profile-detail" hidden={!detailOpen} className="border-t border-border/60">
              <dl className="divide-y divide-border/60">
                {detailRows.map(([term, value]) => (
                  <div key={term} className="flex min-h-11 items-center justify-between gap-4 px-4">
                    <dt className="text-[15px] text-muted-foreground">{term}</dt>
                    <dd className="text-right text-[15px] font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              {profileError && (
                <p role="alert" className="px-4 pb-2 text-[13px] text-destructive">
                  {profileError}
                </p>
              )}
              <div className="flex divide-x divide-border/60 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => {
                    setEditingProfile(true);
                    setProfileError(null);
                    setProfileFieldErrors({});
                  }}
                  className="tap min-h-12 flex-1 text-[15px] font-medium text-[#0a84ff]"
                >
                  Ubah data diri
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="tap min-h-12 flex-1 text-[15px] font-medium text-destructive"
                >
                  Hapus data
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      <h2 className={capClass}>Data saya</h2>
      <section className={groupClass} aria-label="Data saya">
        <ProfileServiceGrid tiles={tiles} onCalendar={() => setCalendarOpen(true)} />
      </section>

      <h2 className={capClass}>Pesanan terakhir</h2>
      <section className={groupClass} aria-label="Pesanan terakhir">
        {recentOrders.length === 0 ? (
          <p className="px-4 py-4 text-[15px] text-muted-foreground">Belum ada pesanan.</p>
        ) : (
          recentOrders.map((o, index) => {
            const status = effectiveOrderStatus(o.status, o.expiresAt);
            const finished = ["EXPIRED", "REFUNDED", "CANCELLED", "PROVISIONING_FAILED"].includes(
              status,
            );
            const art = destinationArt(o.locationCodes?.[0]);
            const code = (o.publicOrderCode ?? o.id).slice(0, 6).toUpperCase();
            const date = new Date(o.createdAt).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "short",
            });
            return (
              <Link
                key={o.id}
                to="/order/$id"
                params={{ id: o.id }}
                className={`${rowClass} min-h-[76px] py-3 ${index > 0 ? "border-t border-border/60" : ""}`}
              >
                <span
                  className={`grid size-12 shrink-0 place-items-center rounded-2xl ${art.tint} ${finished ? "opacity-60 grayscale" : ""}`}
                >
                  {art.src ? (
                    <img
                      src={art.src}
                      alt=""
                      width={36}
                      height={36}
                      loading="lazy"
                      decoding="async"
                      className="size-9 object-contain"
                    />
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold leading-tight">
                    {o.packageName ?? o.packageId}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                    {rupiah(o.amount)} · {date} · #{code}
                  </span>
                  <span className="mt-1.5 block">
                    <EsimStatusBadge status={status} />
                  </span>
                </span>
                <RowChevron />
              </Link>
            );
          })
        )}
        {orders.length > 0 && (
          <Link
            to="/order-status"
            className={`${rowClass} min-h-[46px] justify-center border-t border-border/60 text-[15px] font-medium text-[#0a84ff]`}
          >
            Lihat semua pesanan
          </Link>
        )}
      </section>

      <h2 className={capClass}>Tentang</h2>
      <nav aria-label="Kebijakan" className={groupClass}>
        {[
          { label: "Syarat & Ketentuan", to: "/terms" as const },
          { label: "Kebijakan Privasi", to: "/privacy" as const },
        ].map(({ label: linkLabel, to }, index) => (
          <Link
            key={to}
            to={to}
            className={`${rowClass} ${index > 0 ? "border-t border-border/60" : ""}`}
          >
            <span className="flex-1">{linkLabel}</span>
            <RowChevron />
          </Link>
        ))}
      </nav>

      <section aria-label="Aplikasi" className={`${groupClass} mt-6 empty:hidden`}>
        <InstallAppCard variant="row" />
        {user ? <PushOptInRow /> : null}
      </section>

      {user && (
        <section className={`${groupClass} mt-6`}>
          <button
            type="button"
            className={`${rowClass} justify-center font-medium text-destructive`}
            onClick={() => {
              void signOutBetterAuth().then(() => {
                // Sign-out is the moment another customer could pick up this device.
                clearTravelLocalData();
                setUser(null);
              });
            }}
          >
            Keluar
          </button>
        </section>
      )}

      <div className="mt-12 text-center">
        <Wordmark className="mx-auto h-16" />
        <p className="mt-1 text-sm text-muted-foreground">Bawa Djiwamu Lebih Jauh.</p>
      </div>

      <CalendarSheet
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        signedIn={Boolean(user)}
        loading={calendarStatusLoading}
        statusError={calendarStatusError}
        connected={calendarConnected}
        account={calendarAccount}
        message={calendarMessage}
        messageKind={calendarMessageKind}
        syncIssue={calendarSyncIssue}
        busy={calendarBusy}
        onRetrySync={() => void retryCalendarSync()}
        onDisconnect={() => void disconnectCalendar()}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus data profil?</AlertDialogTitle>
            <AlertDialogDescription>
              WhatsApp, nama lengkap, kewarganegaraan, tanggal lahir, dan jenis kelamin yang
              tersimpan akan dihapus. Akun dan pesananmu tidak terpengaruh, tetapi kamu perlu
              mengisi WhatsApp lagi saat checkout berikutnya.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void removeProfile();
              }}
            >
              {deleting ? "Menghapus…" : "Hapus"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  );
}
