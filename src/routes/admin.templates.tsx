import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";
import { requireAdmin } from "@/lib/admin-guard";
import { formatAdminDateTime } from "@/lib/admin-display";
import {
  adminTemplateAction,
  getAdminTemplates,
  saveAdminTemplatesConfig,
} from "@/lib/trip-templates.fn";

export const Route = createFileRoute("/admin/templates")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => getAdminTemplates(),
  component: AdminTemplates,
});

const input = "min-h-11 w-full rounded-xl border border-border bg-background px-3 text-[13px]";
const small =
  "min-h-9 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-50";
const section = "mt-6 rounded-2xl border border-border bg-surface p-5";
const tone = (status: string) =>
  status === "published" ? "good" : status === "hidden" ? "danger" : "neutral";
const STATUS: Record<string, string> = {
  published: "Tayang",
  unpublished: "Nonaktif",
  hidden: "Disembunyikan",
};

type Action = "hide" | "restore" | "feature" | "unfeature" | "delete" | "dismiss_reports";

function AdminTemplates() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ id: string; action: Action; label: string } | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [config, setConfig] = useState(data.config);
  const [configReason, setConfigReason] = useState("");

  async function run(id: string, action: Action, why: string) {
    setBusy(true);
    setNotice(null);
    try {
      await adminTemplateAction({ data: { id, action, reason: why } });
      setPending(null);
      setReason("");
      setNotice("Tersimpan.");
      await router.invalidate();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Aksi gagal.");
    } finally {
      setBusy(false);
    }
  }
  const ask = (id: string, action: Action, label: string) => {
    setReason("");
    setPending({ id, action, label });
  };

  async function saveConfig() {
    setBusy(true);
    setNotice(null);
    try {
      const result = await saveAdminTemplatesConfig({
        data: { config, reason: configReason, expectedVersion: data.version },
      });
      if (!result.ok) setNotice("Pengaturan berubah di tempat lain. Muat ulang dan coba lagi.");
      else {
        setNotice("Pengaturan template tersimpan.");
        setConfigReason("");
      }
      await router.invalidate();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal menyimpan pengaturan.");
    } finally {
      setBusy(false);
    }
  }

  const reasonForm = (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) void run(pending.id, pending.action, reason);
      }}
    >
      <input
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder={`Alasan ${pending?.label ?? ""} (min. 4 karakter)`}
        aria-label="Alasan"
        className={input}
        required
        minLength={4}
      />
      <button type="submit" disabled={busy} className={small}>
        Kirim
      </button>
      <button type="button" className={small} onClick={() => setPending(null)}>
        Batal
      </button>
    </form>
  );

  return (
    <AdminShell
      title="Template Itinerary"
      subtitle="Pantau template buatan member dan Travo, tangani laporan, dan atur batasnya."
    >
      {notice && (
        <p role="status" className="mt-4 rounded-xl bg-secondary p-3 text-sm">
          {notice}
        </p>
      )}
      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Ringkasan">
        {[
          ["Tayang", data.stats.published],
          ["Disusun Travo", data.stats.byTravo],
          ["Dipakai 7 hari", data.stats.uses7d],
          ["Dipakai total", data.stats.usesTotal],
          ["Draf Travo 7 hari", data.stats.drafts7d],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-bold">{value}</p>
          </div>
        ))}
      </section>

      <section className={section}>
        <SectionHeading
          title="Pengaturan"
          detail="Komisi pembuat template memakai program Affiliate: tautan template membawa kode affiliate pembuatnya."
        />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["enabled", "Fitur template aktif"],
              ["showTile", "Tampilkan tile Template di Home & Explore"],
              ["aiEnabled", "Travo boleh membuat draf template"],
            ] as const
          ).map(([key, text]) => (
            <label key={key} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={config[key]}
                onChange={(event) => setConfig({ ...config, [key]: event.target.checked })}
              />
              {text}
            </label>
          ))}
          {(
            [
              ["maxPerUser", "Template aktif per member", 1, 200],
              ["aiDailyDrafts", "Draf Travo per member per hari", 0, 50],
              ["dailyUses", "Pemakaian template per member per hari", 1, 200],
            ] as const
          ).map(([key, text, min, max]) => (
            <label key={key} className="text-xs">
              {text}
              <input
                type="number"
                min={min}
                max={max}
                value={config[key]}
                onChange={(event) => setConfig({ ...config, [key]: Number(event.target.value) })}
                className={`${input} mt-1`}
              />
            </label>
          ))}
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void saveConfig();
          }}
        >
          <input
            value={configReason}
            onChange={(event) => setConfigReason(event.target.value)}
            placeholder="Alasan perubahan (min. 4 karakter)"
            aria-label="Alasan perubahan pengaturan"
            className={input}
            required
            minLength={4}
          />
          <button type="submit" disabled={busy} className={small}>
            Simpan
          </button>
        </form>
      </section>

      <section className={section}>
        <SectionHeading title={`Laporan terbuka (${data.reports.length})`} />
        {data.reports.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Tidak ada laporan.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {data.reports.map((report) => (
              <li key={report.id} className="py-3 text-sm">
                <p className="font-semibold">{report.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {report.reason} · {formatAdminDateTime(report.createdAt)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a
                    className={small}
                    href={`/template/${report.slug}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Buka
                  </a>
                  <button
                    className={small}
                    onClick={() => ask(report.templateId, "hide", "sembunyikan")}
                  >
                    Sembunyikan
                  </button>
                  <button
                    className={small}
                    onClick={() => ask(report.templateId, "dismiss_reports", "abaikan laporan")}
                  >
                    Abaikan
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={section}>
        <SectionHeading title="Semua template" detail="200 terbaru." />
        {pending && reasonForm}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="py-2 pr-3">Template</th>
                <th className="pr-3">Pembuat</th>
                <th className="pr-3">Status</th>
                <th className="pr-3">Dilihat / dipakai</th>
                <th className="pr-3">Affiliate</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.templates.map((t) => (
                <tr key={t.id} className="align-top">
                  <td className="py-2 pr-3">
                    <a
                      className="font-semibold"
                      href={`/template/${t.slug}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.title}
                    </a>
                    <p className="text-muted-foreground">
                      {t.destinationName} · {t.days} hari{t.source === "travo" ? " · Travo" : ""}
                      {t.featured ? " · Unggulan" : ""}
                    </p>
                    {t.hiddenReason && <p className="text-red-700">Alasan: {t.hiddenReason}</p>}
                  </td>
                  <td className="pr-3">{t.ownerName ?? "—"}</td>
                  <td className="pr-3">
                    <StatusPill tone={tone(t.status)}>{STATUS[t.status] ?? t.status}</StatusPill>
                    {t.openReports > 0 && (
                      <p className="mt-1 text-red-700">{t.openReports} laporan</p>
                    )}
                  </td>
                  <td className="pr-3">
                    {t.views} / {t.uses}
                  </td>
                  <td className="pr-3">
                    {t.affiliateCode
                      ? `${t.affiliateCode} · ${t.referrals} referral`
                      : "Belum aktif"}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1.5">
                      {t.status === "hidden" ? (
                        <button className={small} onClick={() => ask(t.id, "restore", "pulihkan")}>
                          Pulihkan
                        </button>
                      ) : (
                        <button className={small} onClick={() => ask(t.id, "hide", "sembunyikan")}>
                          Sembunyikan
                        </button>
                      )}
                      <button
                        className={small}
                        onClick={() => ask(t.id, t.featured ? "unfeature" : "feature", "unggulan")}
                      >
                        {t.featured ? "Lepas unggulan" : "Jadikan unggulan"}
                      </button>
                      <button className={small} onClick={() => ask(t.id, "delete", "hapus")}>
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
