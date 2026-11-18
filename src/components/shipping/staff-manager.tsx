import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { formatAdminDateTime } from "@/lib/admin-display";
import { listShippingStaff, saveShippingStaff } from "@/lib/shipping-ops.fn";
import { HUBS, HUB_LABEL, type Hub } from "@/lib/shipping";

type Staff = Awaited<ReturnType<typeof listShippingStaff>>[number];

const input =
  "min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand-red";
const btn =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50";
const btnPrimary =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand-red px-3 text-xs font-semibold text-white disabled:opacity-50";

/**
 * Admin registers field staff by Google email and picks the hubs each works at. They sign in at
 * /petugas with that Google account; nothing else of the admin console opens for them.
 */
export function StaffManager() {
  const [staff, setStaff] = useState<Staff[] | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [hubs, setHubs] = useState<Hub[]>(["TASIK"]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStaff(await listShippingStaff());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Daftar petugas belum bisa dimuat.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save(next: { email: string; name: string; hubs: Hub[]; active: boolean }) {
    setBusy(true);
    try {
      await saveShippingStaff({ data: next });
      toast.success("Akun petugas disimpan");
      await load();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Akun petugas belum tersimpan.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const toggle = (h: Hub) =>
    setHubs((cur) => (cur.includes(h) ? cur.filter((x) => x !== h) : [...cur, h]));

  return (
    <AdminSurface className="space-y-3 p-3">
      <SectionHeading
        title="Akun petugas"
        detail="Petugas masuk di /petugas dengan akun Google yang didaftarkan di sini, dan hanya bisa bekerja di lokasinya."
      />
      <form
        className="space-y-2 rounded-xl bg-secondary p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save({ email, name, hubs, active: true })) {
            setEmail("");
            setName("");
          }
        }}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">
              Email Google
            </span>
            <input
              className={input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="petugas@gmail.com"
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-foreground">Nama</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Bekerja di</p>
          <div className="flex flex-wrap gap-2">
            {HUBS.map((h) => (
              <label
                key={h}
                className="flex min-h-10 items-center gap-2 rounded-xl bg-background px-3 text-sm font-medium"
              >
                <input
                  type="checkbox"
                  checked={hubs.includes(h)}
                  onChange={() => toggle(h)}
                  className="size-5 accent-[var(--brand-red)]"
                />
                {HUB_LABEL[h]}
              </label>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={busy || !email.includes("@") || name.trim().length < 2 || hubs.length === 0}
          className={btnPrimary}
        >
          Daftarkan petugas
        </button>
      </form>

      {staff === null ? (
        <p className="text-xs text-muted-foreground">Memuat…</p>
      ) : staff.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Belum ada petugas. Daftarkan email Google petugas di atas.
        </p>
      ) : (
        <ul className="space-y-2">
          {staff.map((m) => (
            <li key={m.id} className="rounded-xl bg-secondary p-3 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{m.name}</p>
                  <p className="break-all text-muted-foreground">{m.email}</p>
                  <p className="mt-0.5">
                    {m.hubs.map((h) => HUB_LABEL[h]).join(", ")}
                    {m.lastSeenAt
                      ? ` · terakhir ${formatAdminDateTime(m.lastSeenAt)}`
                      : " · belum pernah masuk"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={m.active ? "good" : "neutral"}>
                    {m.active ? "Aktif" : "Nonaktif"}
                  </StatusPill>
                  <button
                    type="button"
                    disabled={busy}
                    className={btn}
                    onClick={() =>
                      save({ email: m.email, name: m.name, hubs: m.hubs, active: !m.active })
                    }
                  >
                    {m.active ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminSurface>
  );
}
