import { useState } from "react";
import { AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { saveAdminGuestTrips } from "@/lib/guest-trips.fn";
import {
  GUEST_TRIP_LIMIT_MAX,
  GUEST_TRIP_LIMIT_MIN,
  parseGuestTripsConfig,
  type GuestTripsConfig,
} from "@/lib/guest-trips";

/**
 * Admin control for freemium My Trips. It edits the `guestTrips` record the customer My Trips page
 * reads: the switch turns guest access off (guests see the login gate again), and the limit sets
 * how many trips one guest browser may create before logging in. Trips already made stay put.
 */
export function AdminGuestTripsPanel({
  initial,
  version: initialVersion,
  stats,
}: {
  initial: GuestTripsConfig;
  version: number;
  stats: { guestTrips: number };
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [limit, setLimit] = useState(initial.limit);
  const [version, setVersion] = useState(initialVersion);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<
    { kind: "idle" } | { kind: "saving" } | { kind: "ok" } | { kind: "error"; message: string }
  >({ kind: "idle" });

  const save = async () => {
    setStatus({ kind: "saving" });
    try {
      const config = parseGuestTripsConfig({ enabled, limit });
      const result = await saveAdminGuestTrips({
        data: { config, reason, expectedVersion: version },
      });
      if (!result.ok) {
        setVersion(result.version);
        setStatus({
          kind: "error",
          message: "Pengaturan sudah diubah admin lain. Muat ulang halaman, lalu coba lagi.",
        });
        return;
      }
      setVersion(result.version);
      setStatus({ kind: "ok" });
    } catch (error) {
      setStatus({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Gagal menyimpan. Tidak ada yang berubah.",
      });
    }
  };

  return (
    <div className="space-y-2" data-testid="admin-guest-trips-panel">
      <div className="flex items-center justify-between gap-2">
        <SectionHeading
          title="Perjalanan tanpa login"
          detail="Coba gratis di halaman Perjalanan sebelum pelanggan login."
        />
        <StatusPill tone={enabled ? "good" : "warn"}>{enabled ? "Aktif" : "Nonaktif"}</StatusPill>
      </div>
      <AdminSurface className="space-y-3 p-3">
        <p className="text-xs text-muted-foreground" data-testid="guest-trips-stats">
          {stats.guestTrips} perjalanan tamu tersimpan di browser pengunjung (belum login).
        </p>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => setEnabled(event.target.checked)}
            className="size-5 accent-primary"
          />
          Izinkan membuat perjalanan tanpa login
        </label>
        <label className="block text-sm font-semibold">
          Batas perjalanan per browser tamu
          <input
            type="number"
            min={GUEST_TRIP_LIMIT_MIN}
            max={GUEST_TRIP_LIMIT_MAX}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            {GUEST_TRIP_LIMIT_MIN}-{GUEST_TRIP_LIMIT_MAX}. Setelah batas tercapai, tamu diminta
            masuk. Perjalanan tamu pindah otomatis ke akun saat login di perangkat yang sama.
          </span>
        </label>
        <label className="block text-sm font-semibold">
          Alasan perubahan
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Contoh: menaikkan batas coba gratis untuk promo"
            className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => void save()}
          disabled={status.kind === "saving" || reason.trim().length < 4}
          className="min-h-11 w-full rounded-xl bg-brand-red px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {status.kind === "saving" ? "Menyimpan…" : "Simpan pengaturan"}
        </button>
        {status.kind === "ok" && (
          <p role="status" className="text-xs font-medium text-success">
            Pengaturan tersimpan dan dicatat di audit log.
          </p>
        )}
        {status.kind === "error" && (
          <p role="alert" className="text-xs font-medium text-brand-red">
            {status.message}
          </p>
        )}
      </AdminSurface>
    </div>
  );
}
