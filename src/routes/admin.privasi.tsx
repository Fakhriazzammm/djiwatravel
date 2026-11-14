import { createFileRoute } from "@tanstack/react-router";
import { AdminShell, AdminSurface, SectionHeading, StatusPill } from "@/components/admin-shell";
import { formatAdminDateTime } from "@/lib/admin-display";
import { requireAdmin } from "@/lib/admin-guard";
import { getAdminConsent } from "@/lib/consent.fn";
import { CONSENT_LABEL, CONSENT_FEATURES } from "@/lib/consent";

export const Route = createFileRoute("/admin/privasi")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => getAdminConsent(),
  component: AdminPrivacy,
});

const SOURCE_LABEL: Record<string, string> = {
  prompt: "Popup setelah masuk",
  settings: "Profil › Privasi",
  just_in_time: "Saat memakai fitur",
};

function AdminPrivacy() {
  const data = Route.useLoaderData();
  return (
    <AdminShell
      title="Privasi & persetujuan"
      subtitle="Ringkasan persetujuan data akun. Hanya baca: persetujuan milik pelanggan dan hanya pelanggan yang bisa mengubahnya."
    >
      <div className="space-y-3">
        <dl className="grid grid-cols-3 gap-2">
          {[
            ["Sudah menjawab", data.prompts.answered],
            ["Menunda", data.prompts.snoozed],
            ["Akun tercatat", data.prompts.total],
          ].map(([label, value]) => (
            <AdminSurface key={label} className="p-3">
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="text-xl font-bold">{value}</dd>
            </AdminSurface>
          ))}
        </dl>

        <section aria-label="Per tujuan">
          <SectionHeading title="Per tujuan" />
          <div className="space-y-2">
            {data.purposes.map((row) => (
              <AdminSurface key={row.purpose} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{CONSENT_LABEL[row.purpose]}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {CONSENT_FEATURES[row.purpose].join(" · ")}
                  </p>
                </div>
                <StatusPill tone="good">{row.granted} setuju</StatusPill>
                <StatusPill>{row.withdrawn} menarik</StatusPill>
              </AdminSurface>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Versi teks persetujuan: {data.version}. Analitik tidak dihitung di sini karena itu
            pilihan banner cookie di tiap perangkat.
          </p>
        </section>

        <section aria-label="Perubahan terbaru">
          <SectionHeading title="Perubahan terbaru" />
          {data.recent.length === 0 ? (
            <AdminSurface className="p-4 text-center text-sm text-muted-foreground">
              Belum ada persetujuan yang tercatat.
            </AdminSurface>
          ) : (
            <div className="space-y-1.5">
              {data.recent.map((row, index) => (
                <AdminSurface key={`${row.ref}-${row.purpose}-${index}`} className="p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">akun #{row.ref}</span>
                    <b>{CONSENT_LABEL[row.purpose]}</b>
                    <StatusPill tone={row.granted ? "good" : "neutral"}>
                      {row.granted ? "Setuju" : "Menarik"}
                    </StatusPill>
                    <span className="text-muted-foreground">
                      {SOURCE_LABEL[row.source] ?? row.source}
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      {formatAdminDateTime(row.at)}
                    </span>
                  </div>
                </AdminSurface>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
