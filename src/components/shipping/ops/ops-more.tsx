import { LogOut } from "lucide-react";
import { signOutBetterAuth } from "@/lib/better-auth-client";
import { HUB_LABEL, type Hub } from "@/lib/shipping";
import { bigBtn, type OpsMe } from "./ops-types";

/** Location, account and (for Admin) the way back to the rest of the console. */
export function OpsMore({
  me,
  hub,
  onAdminTab,
}: {
  me: OpsMe;
  hub: Hub;
  onAdminTab?: ((tab: "staff" | "settings") => void) | undefined;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-[15px] font-bold">{me.name || me.email}</p>
        <p className="text-[12px] text-muted-foreground">
          {me.email} · {me.isAdmin ? "Admin" : "Petugas"}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4 text-[13px]">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Lokasi kerja
        </p>
        <p className="mt-0.5 font-semibold">{me.hubs.map((h) => HUB_LABEL[h]).join(", ")}</p>
        <p className="text-[12px] text-muted-foreground">
          Sekarang di {HUB_LABEL[hub]}.
          {me.hubs.length > 1 ? " Ganti lokasi lewat pilihan di atas layar Scan." : ""}
        </p>
      </div>

      {me.isAdmin && onAdminTab && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Admin Kirim Barang
          </p>
          <div className="grid gap-1.5">
            {(
              [
                ["staff", "Akun petugas"],
                ["settings", "Pengaturan"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => onAdminTab(id)}
                className={`${bigBtn} justify-start border border-border bg-surface`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!onAdminTab && (
        <button
          type="button"
          onClick={() => {
            void Promise.resolve(signOutBetterAuth()).finally(() => window.location.reload());
          }}
          className={`${bigBtn} border border-border bg-surface text-destructive`}
        >
          <LogOut className="size-4" aria-hidden="true" />
          Keluar
        </button>
      )}
    </div>
  );
}
