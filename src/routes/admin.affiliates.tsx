import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { requireAdmin } from "@/lib/admin-guard";
import {
  getAdminAffiliates,
  mutateAdminAffiliate,
  saveAdminAffiliateConfig,
} from "@/lib/affiliate.fn";
import { AdminShell, SectionHeading, StatusPill } from "@/components/admin-shell";
import { formatAdminDateTime, humanizeAdminStatus } from "@/lib/admin-display";
import {
  COMMISSION_LABEL,
  PAYOUT_LABEL,
  type CommissionStatus,
  type PayoutStatus,
} from "@/lib/affiliate";
import { rupiah } from "@/lib/pricing";

export const Route = createFileRoute("/admin/affiliates")({
  beforeLoad: () => requireAdmin(),
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  loader: () => getAdminAffiliates(),
  component: AdminAffiliates,
});

type Pending =
  | { kind: "reason"; label: string; payload: Record<string, unknown> }
  | { kind: "reference"; payoutId: string };

const input = "min-h-11 w-full rounded-xl border border-border bg-background px-3 text-[13px]";
const small =
  "min-h-9 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-50";
const tone = (status: string) =>
  ["approved", "paid", "active"].includes(status)
    ? "good"
    : ["requested", "pending"].includes(status)
      ? "warn"
      : ["rejected", "reversed", "suspended"].includes(status)
        ? "danger"
        : "neutral";

function AdminAffiliates() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [text, setText] = useState("");
  const [config, setConfig] = useState(data.config);
  const [configReason, setConfigReason] = useState("");

  const act = async (payload: Record<string, unknown>, done: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await mutateAdminAffiliate({ data: payload } as never);
      setPending(null);
      setText("");
      setNotice(done);
      await router.invalidate();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Aksi gagal.");
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await saveAdminAffiliateConfig({
        data: { config, reason: configReason, expectedVersion: data.version },
      } as never);
      if (!result.ok) setNotice("Pengaturan berubah di tempat lain. Muat ulang dan coba lagi.");
      else {
        setNotice("Pengaturan program tersimpan.");
        setConfigReason("");
      }
      await router.invalidate();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Gagal menyimpan pengaturan.");
    } finally {
      setBusy(false);
    }
  };

  const reasonForm = (onSubmit: (reason: string) => void) => (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(text);
      }}
    >
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Alasan (min. 4 karakter)"
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

  const ask = (label: string, payload: Record<string, unknown>) => {
    setText("");
    setPending({ kind: "reason", label, payload });
  };

  const sectionClass = "mt-6 rounded-2xl border border-border bg-surface p-5";

  return (
    <AdminShell
      title="Affiliate"
      subtitle="Kelola program referral, penarikan komisi, dan indikasi penyalahgunaan."
    >
      {notice && (
        <p role="status" className="mt-4 rounded-xl bg-secondary p-3 text-sm">
          {notice}
        </p>
      )}

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Ringkasan">
        {[
          ["Affiliate", String(data.totals.accounts)],
          ["Referral", String(data.totals.referrals)],
          ["Kewajiban komisi", rupiah(data.totals.liabilityIdr)],
          ["Sudah dicairkan", rupiah(data.totals.paidIdr)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border bg-surface p-4">
            <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
            <p className="mt-1 text-base font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <section className={sectionClass}>
        <SectionHeading
          title="Pengaturan program"
          detail="Komisi dihitung dari margin (markup) order, bukan harga jual. Perubahan hanya berlaku untuk komisi baru."
        />
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs">
            Komisi (% margin)
            <input
              type="number"
              min={0}
              max={100}
              step="0.5"
              className={input}
              value={config.commissionPercent}
              onChange={(event) =>
                setConfig({ ...config, commissionPercent: Number(event.target.value) })
              }
            />
          </label>
          <label className="text-xs">
            Masa tunggu (hari)
            <input
              type="number"
              min={0}
              max={90}
              className={input}
              value={config.holdDays}
              onChange={(event) => setConfig({ ...config, holdDays: Number(event.target.value) })}
            />
          </label>
          <label className="text-xs">
            Minimal tarik (Rp)
            <input
              type="number"
              min={0}
              className={input}
              value={config.minPayoutIdr}
              onChange={(event) =>
                setConfig({ ...config, minPayoutIdr: Number(event.target.value) })
              }
            />
          </label>
          <label className="text-xs">
            Masa cookie (hari)
            <input
              type="number"
              min={1}
              max={180}
              className={input}
              value={config.cookieDays}
              onChange={(event) => setConfig({ ...config, cookieDays: Number(event.target.value) })}
            />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(event) => setConfig({ ...config, enabled: event.target.checked })}
          />
          Program aktif (nonaktif menghentikan pendaftaran baru, atribusi, dan komisi baru)
        </label>
        <div className="mt-3 flex gap-2">
          <input
            value={configReason}
            onChange={(event) => setConfigReason(event.target.value)}
            placeholder="Alasan perubahan"
            aria-label="Alasan perubahan"
            className={input}
          />
          <button
            type="button"
            disabled={busy || configReason.trim().length < 4}
            onClick={() => void saveConfig()}
            className={`${small} whitespace-nowrap`}
          >
            Simpan
          </button>
        </div>
      </section>

      <section className={sectionClass}>
        <SectionHeading
          title="Antrian penarikan"
          detail="Setujui, lalu tandai dibayar dengan referensi transfer atau kredit Djiwa Pay. Saldo wallet tetap dikelola Djiwa Pay."
        />
        {data.payouts.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Belum ada penarikan.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Affiliate</th>
                  <th className="p-3">Jumlah</th>
                  <th className="p-3">Tujuan</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Flag</th>
                  <th className="p-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {data.payouts.map((p) => {
                  const open = p.status === "requested" || p.status === "approved";
                  return (
                    <tr key={p.id} className="border-b align-top last:border-0">
                      <td className="p-3">
                        <div className="font-semibold">{p.code}</div>
                        <div className="text-xs text-muted-foreground">{p.email ?? "-"}</div>
                      </td>
                      <td className="p-3 tabular-nums">{rupiah(p.amountIdr)}</td>
                      <td className="max-w-[260px] p-3 text-xs">{p.destination}</td>
                      <td className="p-3">
                        <StatusPill tone={tone(p.status)}>
                          {PAYOUT_LABEL[p.status as PayoutStatus] ?? p.status}
                        </StatusPill>
                        {p.reference && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            ref {p.reference}
                          </div>
                        )}
                        {p.note && (
                          <div className="mt-1 text-xs text-muted-foreground">{p.note}</div>
                        )}
                      </td>
                      <td className="p-3">
                        {p.flaggedReferrals > 0 ? (
                          <StatusPill tone="warn">
                            {p.flaggedReferrals} referral ditandai
                          </StatusPill>
                        ) : (
                          <StatusPill tone="good">bersih</StatusPill>
                        )}
                      </td>
                      <td className="p-3">
                        {open && pending?.kind === "reference" && pending.payoutId === p.id ? (
                          <form
                            className="flex w-60 gap-2"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void act(
                                { action: "payout.markPaid", payoutId: p.id, reference: text },
                                "Penarikan ditandai dibayar.",
                              );
                            }}
                          >
                            <input
                              value={text}
                              onChange={(event) => setText(event.target.value)}
                              placeholder="Referensi pembayaran"
                              aria-label="Referensi pembayaran"
                              className={input}
                              required
                              minLength={3}
                            />
                            <button type="submit" disabled={busy} className={small}>
                              OK
                            </button>
                          </form>
                        ) : open &&
                          pending?.kind === "reason" &&
                          pending.payload["payoutId"] === p.id ? (
                          <div className="w-64">
                            {reasonForm(
                              (reason) =>
                                void act({ ...pending.payload, reason }, "Aksi tersimpan."),
                            )}
                          </div>
                        ) : open ? (
                          <div className="flex flex-wrap gap-2">
                            {p.status === "requested" && (
                              <button
                                type="button"
                                disabled={busy}
                                className={small}
                                onClick={() =>
                                  void act(
                                    { action: "payout.approve", payoutId: p.id },
                                    "Penarikan disetujui.",
                                  )
                                }
                              >
                                Setujui
                              </button>
                            )}
                            <button
                              type="button"
                              className={small}
                              onClick={() => {
                                setText("");
                                setPending({ kind: "reference", payoutId: p.id });
                              }}
                            >
                              Tandai dibayar
                            </button>
                            <button
                              type="button"
                              className={`${small} text-destructive`}
                              onClick={() =>
                                ask("Tolak penarikan", { action: "payout.reject", payoutId: p.id })
                              }
                            >
                              Tolak
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {p.reviewedBy ?? "-"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={sectionClass}>
        <SectionHeading
          title="Referral ditandai"
          detail="Ditahan dari komisi sampai admin membebaskannya."
        />
        {data.flagged.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Tidak ada referral yang ditandai.</p>
        ) : (
          <ul className="mt-3 divide-y text-sm">
            {data.flagged.map((f) => (
              <li key={f.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <b>{f.code}</b> ← {f.email ?? "-"}{" "}
                    <span className="text-xs text-muted-foreground">
                      · {f.reason} · {formatAdminDateTime(f.lockedAt)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={small}
                    onClick={() =>
                      ask("Bebaskan referral", { action: "referral.unflag", referralId: f.id })
                    }
                  >
                    Bebaskan
                  </button>
                </div>
                {pending?.kind === "reason" &&
                  pending.payload["referralId"] === f.id &&
                  reasonForm(
                    (reason) => void act({ ...pending.payload, reason }, "Referral dibebaskan."),
                  )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={sectionClass}>
        <SectionHeading
          title="Daftar affiliate"
          detail="Suspend menghentikan komisi baru dan penarikan; tarif khusus menimpa tarif program."
        />
        {data.accounts.length === 0 ? (
          <p className="mt-5 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Belum ada affiliate.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Kode</th>
                  <th className="p-3">Klik</th>
                  <th className="p-3">Referral</th>
                  <th className="p-3">Menunggu</th>
                  <th className="p-3">Disetujui</th>
                  <th className="p-3">Dicairkan</th>
                  <th className="p-3">Tarif</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {data.accounts.map((a) => (
                  <tr key={a.id} className="border-b align-top last:border-0">
                    <td className="p-3">
                      <div className="font-semibold">{a.code}</div>
                      <div className="text-xs text-muted-foreground">{a.email ?? "-"}</div>
                    </td>
                    <td className="p-3">{a.clicks}</td>
                    <td className="p-3">{a.referrals}</td>
                    <td className="p-3 tabular-nums">{rupiah(a.pendingIdr)}</td>
                    <td className="p-3 tabular-nums">{rupiah(a.approvedIdr)}</td>
                    <td className="p-3 tabular-nums">{rupiah(a.paidIdr)}</td>
                    <td className="p-3">
                      {a.percentOverride === null ? "Program" : `${a.percentOverride}%`}
                    </td>
                    <td className="p-3">
                      <StatusPill tone={tone(a.status)}>{humanizeAdminStatus(a.status)}</StatusPill>
                      {a.suspendedReason && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {a.suspendedReason}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      {pending?.kind === "reason" && pending.payload["accountId"] === a.id ? (
                        <div className="w-64">
                          {reasonForm(
                            (reason) =>
                              void act({ ...pending.payload, reason }, "Perubahan akun tersimpan."),
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {a.status === "active" ? (
                            <button
                              type="button"
                              className={`${small} text-destructive`}
                              onClick={() =>
                                ask("Suspend", { action: "account.suspend", accountId: a.id })
                              }
                            >
                              Suspend
                            </button>
                          ) : (
                            <button
                              type="button"
                              className={small}
                              onClick={() =>
                                ask("Aktifkan", { action: "account.activate", accountId: a.id })
                              }
                            >
                              Aktifkan
                            </button>
                          )}
                          <button
                            type="button"
                            className={small}
                            onClick={() => {
                              const value = window.prompt(
                                "Tarif khusus (%) — kosongkan untuk kembali ke tarif program",
                                a.percentOverride === null ? "" : String(a.percentOverride),
                              );
                              if (value === null) return;
                              const percent = value.trim() === "" ? null : Number(value);
                              if (
                                percent !== null &&
                                (!Number.isFinite(percent) || percent < 0 || percent > 100)
                              ) {
                                setNotice("Tarif harus 0-100.");
                                return;
                              }
                              ask("Tarif khusus", {
                                action: "account.setPercent",
                                accountId: a.id,
                                percent,
                              });
                            }}
                          >
                            Tarif
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={sectionClass}>
        <SectionHeading
          title="Komisi terbaru"
          detail="Dibuat otomatis dari order terbayar; refund membatalkannya otomatis. Koreksi manual wajib beralasan."
        />
        {data.commissions.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">Belum ada komisi.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="p-3">Order</th>
                  <th className="p-3">Affiliate</th>
                  <th className="p-3">Komisi</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Matang</th>
                  <th className="p-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {data.commissions.map((c) => (
                  <tr key={c.id} className="border-b align-top last:border-0">
                    <td className="p-3">
                      <Link
                        to={`/admin/orders/${c.orderId}` as never}
                        className="font-semibold text-brand-red"
                      >
                        {c.orderCode}
                      </Link>
                    </td>
                    <td className="p-3">{c.code}</td>
                    <td className="p-3 tabular-nums">
                      {rupiah(c.amountIdr)}{" "}
                      <span className="text-xs text-muted-foreground">({c.percent}%)</span>
                    </td>
                    <td className="p-3">
                      <StatusPill tone={tone(c.status)}>
                        {COMMISSION_LABEL[c.status as CommissionStatus] ?? c.status}
                      </StatusPill>
                      {c.reason && (
                        <div className="mt-1 text-xs text-muted-foreground">{c.reason}</div>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {formatAdminDateTime(c.maturesAt)}
                    </td>
                    <td className="p-3">
                      {["pending", "approved"].includes(c.status) &&
                        (pending?.kind === "reason" && pending.payload["commissionId"] === c.id ? (
                          <div className="w-64">
                            {reasonForm(
                              (reason) =>
                                void act({ ...pending.payload, reason }, "Komisi dibatalkan."),
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className={`${small} text-destructive`}
                            onClick={() =>
                              ask("Batalkan komisi", {
                                action: "commission.reverse",
                                commissionId: c.id,
                              })
                            }
                          >
                            Batalkan
                          </button>
                        ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
