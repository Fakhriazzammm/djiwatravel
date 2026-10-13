import { Eye, EyeOff, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-guard";
import { getTravelFinanceReport, submitTravelExpense } from "@/lib/admin-finance.server";
import { formatAdminDateTime } from "@/lib/admin-display";
import { AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";

const PERIODS = [
  { days: 30, label: "30 hari" },
  { days: 90, label: "90 hari" },
  { days: 365, label: "1 tahun" },
] as const;

export const Route = createFileRoute("/admin/finance")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  validateSearch: z.object({ days: z.coerce.number().int().min(1).max(366).default(30) }),
  loaderDeps: ({ search }) => ({ days: search.days }),
  loader: ({ deps }) => getTravelFinanceReport({ data: deps }),
  component: AdminFinance,
});

function amount(value: number, masked: boolean) {
  return masked ? "••••" : `Rp${value.toLocaleString("id-ID")}`;
}

function AdminFinance() {
  const view = Route.useLoaderData();
  const search = Route.useSearch();
  const router = useRouter();
  const submitExpense = useServerFn(submitTravelExpense);
  const [privateMode, setPrivateMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
  const [form, setForm] = useState({
    key: crypto.randomUUID(),
    amount: "",
    category: "",
    description: "",
    merchant: "",
    occurredOn: new Date().toISOString().slice(0, 10),
  });

  const report = view.state === "ok" ? view.report : null;
  const maxDaily = report ? Math.max(1, ...report.daily.map((row) => row.income + row.expense)) : 1;

  const refresh = async () => {
    setBusy(true);
    setFeedback(null);
    await router.invalidate();
    setBusy(false);
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = Number(form.amount.replace(/[^\d]/g, ""));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || !form.category.trim() || !form.description.trim()) {
      setFeedback({ tone: "warn", text: "Jumlah, kategori, dan keterangan wajib diisi." });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const result = await submitExpense({
        data: {
          externalId: form.key,
          amount: parsedAmount,
          category: form.category.trim(),
          description: form.description.trim(),
          ...(form.merchant.trim() ? { merchant: form.merchant.trim() } : {}),
          occurredAtMs: new Date(`${form.occurredOn}T00:00:00+07:00`).getTime(),
        },
      });
      if (!result.ok) {
        setFeedback({ tone: "error", text: `Gagal dicatat (${result.error}). Coba lagi.` });
        return;
      }
      setFeedback({
        tone: result.duplicate ? "warn" : "ok",
        text: result.duplicate
          ? "Pengeluaran ini sudah tercatat sebelumnya — tidak digandakan."
          : "Pengeluaran tercatat di buku Travel.",
      });
      // A new key per save keeps retries idempotent without merging two legitimate expenses.
      setForm({
        key: crypto.randomUUID(),
        amount: "",
        category: "",
        description: "",
        merchant: "",
        occurredOn: form.occurredOn,
      });
      await router.invalidate();
    } catch {
      setFeedback({ tone: "error", text: "Gagal menghubungi buku Travel. Tidak ada data yang berubah." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell title="Keuangan" subtitle="Buku Travel terpisah dari buku F&B — angka di sini hanya milik Travel.">
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2" role="group" aria-label="Periode laporan">
          {PERIODS.map((option) => (
            <button
              key={option.days}
              type="button"
              onClick={() => void router.navigate({ to: "/admin/finance", search: { days: option.days } } as never)}
              aria-pressed={search.days === option.days}
              className={`min-h-9 rounded-lg px-3 text-xs font-semibold ${search.days === option.days ? "bg-[#eaf3ff] text-[#0a67c7]" : "text-[#6b6b72]"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPrivateMode((value) => !value)}
            className="flex min-h-9 items-center gap-2 rounded-lg border border-[#e5e5ea] px-3 text-xs font-semibold"
          >
            {privateMode ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {privateMode ? "Privasi aktif" : "Mode privasi"}
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
            className="flex min-h-9 items-center gap-2 rounded-lg border border-[#e5e5ea] px-3 text-xs font-semibold disabled:opacity-60"
          >
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Segarkan
          </button>
        </div>
      </div>

      {view.state !== "ok" ? (
        <section className="mt-4 rounded-xl border border-[#f5d8b0] bg-[#fff8ef] p-4 text-sm text-[#8a5a00]">
          Buku Travel tidak bisa dibaca sekarang ({view.error}). Order dan pembayaran pelanggan tidak
          terpengaruh; angka akan muncul lagi setelah layanan finance merespons.
        </section>
      ) : null}

      {report ? (
        <>
          <section className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Ringkasan buku Travel">
            {[
              { label: "Pemasukan", value: report.totals.income, detail: `${report.totals.incomeCount} transaksi` },
              { label: "Pengeluaran", value: report.totals.expense, detail: `${report.totals.expenseCount} transaksi` },
              { label: "Selisih bersih", value: report.totals.net, detail: `${report.days} hari terakhir` },
            ].map((card) => (
              <article key={card.label} className="rounded-xl border border-[#e5e5ea] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b6b72]">{card.label}</p>
                <p className="mt-2 text-xl font-bold">{amount(card.value, privateMode)}</p>
                <p className="mt-1 text-[11px] text-[#8a8a91]">{card.detail}</p>
              </article>
            ))}
            <article className="rounded-xl border border-[#e5e5ea] bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#6b6b72]">Total transaksi</p>
              <p className="mt-2 text-xl font-bold">
                {privateMode ? "••••" : report.totals.incomeCount + report.totals.expenseCount}
              </p>
              <p className="mt-1 text-[11px] text-[#8a8a91]">
                {report.truncated ? "Melebihi batas tampilan — persempit periode" : "Seluruh baris periode ini"}
              </p>
            </article>
          </section>

          <section className="mt-4 grid gap-3 lg:grid-cols-[1.3fr_.9fr]">
            <article className="rounded-xl border border-[#e5e5ea] bg-white p-4">
              <SectionHeading
                title="Arus harian"
                detail="Pemasukan dan pengeluaran per hari, WIB."
              />
              {report.daily.length === 0 ? (
                <p className="mt-6 text-sm text-[#6b6b72]">Belum ada transaksi pada periode ini.</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {report.daily.slice(0, 14).map((row) => (
                    <li key={row.day}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold">{row.day}</span>
                        <span className="text-[#6b6b72]">
                          masuk {amount(row.income, privateMode)} · keluar {amount(row.expense, privateMode)}
                        </span>
                      </div>
                      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[#f0f0f3]">
                        <div
                          className="bg-[#34c759]"
                          style={{ width: `${Math.round(((row.income + row.expense) / maxDaily) * 100)}%` }}
                          aria-hidden="true"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="rounded-xl border border-[#e5e5ea] bg-white p-4">
              <SectionHeading title="Per kategori" detail="Ke mana uang Travel pergi dan dari mana datangnya." />
              {report.byCategory.length === 0 ? (
                <p className="mt-6 text-sm text-[#6b6b72]">Belum ada kategori pada periode ini.</p>
              ) : (
                <ul className="mt-4 space-y-2 text-sm">
                  {report.byCategory.slice(0, 10).map((row) => (
                    <li key={`${row.txType}-${row.category}`} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <StatusPill tone={row.txType === "income" ? "good" : "warn"}>
                          {row.txType === "income" ? "Masuk" : "Keluar"}
                        </StatusPill>
                        <span>{row.category}</span>
                      </span>
                      <span className="text-xs text-[#6b6b72]">
                        {amount(row.amount, privateMode)} · {row.count}x
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          </section>

          <section className="mt-4">
            <article className="rounded-xl border border-[#e5e5ea] bg-white p-4">
              <SectionHeading title="Transaksi terbaru" detail="Baris dari buku Travel, terbaru lebih dulu." />
              {report.recent.length === 0 ? (
                <p className="mt-6 text-sm text-[#6b6b72]">Belum ada transaksi.</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="text-left text-[11px] uppercase tracking-[0.12em] text-[#8a8a91]">
                      <tr>
                        <th className="pb-2">Waktu (WIB)</th>
                        <th className="pb-2">Jenis</th>
                        <th className="pb-2">Kategori</th>
                        <th className="pb-2">Keterangan</th>
                        <th className="pb-2 text-right">Jumlah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.recent.slice(0, 25).map((entry) => (
                        <tr key={entry.sourceId} className="border-t border-[#f0f0f3]">
                          <td className="py-2 text-xs text-[#6b6b72]">
                            {formatAdminDateTime(entry.occurredAtMs > 0 ? new Date(entry.occurredAtMs).toISOString() : null)}
                          </td>
                          <td className="py-2">
                            <StatusPill tone={entry.txType === "income" ? "good" : "warn"}>
                              {entry.txType === "income" ? "Pemasukan" : "Pengeluaran"}
                            </StatusPill>
                          </td>
                          <td className="py-2 text-xs">{entry.category ?? "—"}</td>
                          <td className="py-2 text-xs text-[#6b6b72]">{entry.description ?? "—"}</td>
                          <td className="py-2 text-right font-semibold">{amount(entry.amount, privateMode)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </article>
          </section>
        </>
      ) : null}

      <section className="mt-4">
        <article className="rounded-xl border border-[#e5e5ea] bg-white p-4">
          <SectionHeading
            title="Catat pengeluaran Travel"
            detail="Biaya provider, operasional, atau pengeluaran lain. Masuk ke buku Travel saja."
          />
          <form className="mt-4 grid gap-3 lg:grid-cols-2" onSubmit={onSubmit}>
            <label className="text-xs font-semibold text-[#6b6b72]">
              Jumlah (Rp)
              <input
                inputMode="numeric"
                value={form.amount}
                onChange={(event) => setForm((value) => ({ ...value, amount: event.target.value.replace(/[^\d]/g, "") }))}
                className="mt-1 min-h-11 w-full rounded-lg border border-[#e5e5ea] px-3 text-sm font-normal text-[#111113]"
                placeholder="150000"
                required
              />
            </label>
            <label className="text-xs font-semibold text-[#6b6b72]">
              Kategori
              <input
                value={form.category}
                onChange={(event) => setForm((value) => ({ ...value, category: event.target.value }))}
                className="mt-1 min-h-11 w-full rounded-lg border border-[#e5e5ea] px-3 text-sm font-normal text-[#111113]"
                placeholder="Top-up saldo provider"
                maxLength={60}
                required
              />
            </label>
            <label className="text-xs font-semibold text-[#6b6b72]">
              Keterangan
              <input
                value={form.description}
                onChange={(event) => setForm((value) => ({ ...value, description: event.target.value }))}
                className="mt-1 min-h-11 w-full rounded-lg border border-[#e5e5ea] px-3 text-sm font-normal text-[#111113]"
                placeholder="Isi saldo eSIM Access 20 USD"
                maxLength={200}
                required
              />
            </label>
            <label className="text-xs font-semibold text-[#6b6b72]">
              Tanggal
              <input
                type="date"
                value={form.occurredOn}
                onChange={(event) => setForm((value) => ({ ...value, occurredOn: event.target.value }))}
                className="mt-1 min-h-11 w-full rounded-lg border border-[#e5e5ea] px-3 text-sm font-normal text-[#111113]"
                required
              />
            </label>
            <label className="text-xs font-semibold text-[#6b6b72]">
              Vendor (opsional)
              <input
                value={form.merchant}
                onChange={(event) => setForm((value) => ({ ...value, merchant: event.target.value }))}
                className="mt-1 min-h-11 w-full rounded-lg border border-[#e5e5ea] px-3 text-sm font-normal text-[#111113]"
                placeholder="esimaccess"
                maxLength={80}
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={busy}
                className="flex min-h-11 items-center gap-2 rounded-lg bg-[#0a84ff] px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Simpan pengeluaran
              </button>
            </div>
          </form>
          {feedback ? (
            <p
              role="status"
              className={`mt-3 text-xs font-semibold ${
                feedback.tone === "ok" ? "text-[#1c7c3c]" : feedback.tone === "warn" ? "text-[#8a5a00]" : "text-[#c0392b]"
              }`}
            >
              {feedback.text}
            </p>
          ) : null}
        </article>
      </section>
    </AdminShell>
  );
}
