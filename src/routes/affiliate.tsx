import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { BackBar, Page, btnPrimary } from "@/components/shell";
import { CustomerAuth } from "@/components/customer-auth";
import {
  activateAffiliate,
  changeAffiliateCode,
  getAffiliateDashboard,
  requestAffiliatePayout,
} from "@/lib/affiliate.fn";
import {
  affiliateLink,
  COMMISSION_LABEL,
  PAYOUT_LABEL,
  type CommissionStatus,
  type PayoutStatus,
} from "@/lib/affiliate";
import { rupiah } from "@/lib/pricing";

export const Route = createFileRoute("/affiliate")({
  head: () => ({
    meta: [
      { title: "Affiliate — Djiwa Travel" },
      { name: "description", content: "Ajak teman beli eSIM dan dapatkan komisi." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: () => getAffiliateDashboard(),
  component: AffiliatePage,
});

const card = "rounded-2xl border border-border/60 bg-card p-4";
const ghostBtn =
  "tap flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-[14px] font-semibold";
const tone: Record<string, string> = {
  pending: "text-amber-600",
  approved: "text-emerald-600",
  paid: "text-foreground",
  reversed: "text-destructive",
  requested: "text-amber-600",
  rejected: "text-destructive",
};

function CommissionRules({
  config,
  percent,
}: {
  config: { holdDays: number; minPayoutIdr: number };
  percent: number;
}) {
  const rows: Array<[string, string]> = [
    [
      "Yang dihitung",
      `${percent}% dari margin, yaitu selisih harga jual dengan modal, dari order pertama temanmu. Bukan dari total yang dibayar.`,
    ],
    [
      "Kapan cair",
      `Komisi berstatus "Menunggu" selama ${config.holdDays} hari. Jika tidak ada refund dan eSIM aktif normal, statusnya menjadi "Disetujui".`,
    ],
    [
      "Kapan dibatalkan",
      "Order direfund atau dibatalkan membuat komisi dibatalkan. Jika eSIM gagal aktif, komisi menunggu sampai masalahnya selesai dan belum masuk penarikan.",
    ],
    [
      "Siapa yang dihitung",
      "Hanya teman yang baru pertama kali membeli. Akun yang sudah pernah membayar order tidak dihitung.",
    ],
    [
      "Yang tidak diperbolehkan",
      "Referral diri sendiri, dan banyak akun dari satu perangkat. Pola seperti ini ditahan untuk ditinjau tim kami.",
    ],
    [
      "Penarikan",
      `Minimal ${rupiah(config.minPayoutIdr)}, ke saldo Djiwa Pay atau rekening bank. Permintaan ditinjau maksimal 1×24 jam kerja. Jika ada komisi yang dibatalkan saat penarikan diproses, jumlahnya menyesuaikan otomatis.`,
    ],
  ];
  return (
    <details className="group rounded-xl border border-border/60 bg-background">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between px-3 text-[13px] font-medium list-none">
        Aturan lengkap
        <span
          aria-hidden="true"
          className="text-muted-foreground transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <dl className="space-y-2 px-3 pb-3 text-[13px]">
        {rows.map(([term, detail]) => (
          <div key={term}>
            <dt className="font-semibold">{term}</dt>
            <dd className="text-muted-foreground">{detail}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function dateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function AffiliatePage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [terms, setTerms] = useState(false);
  const [editCode, setEditCode] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [method, setMethod] = useState<"djiwa_pay" | "bank">("djiwa_pay");
  const [bank, setBank] = useState({ bankName: "", accountName: "", accountNumber: "" });

  const run = async (task: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await task();
      setNotice(done);
      await router.invalidate();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Terjadi kesalahan, coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  if (data.state === "signed_out")
    return (
      <Page>
        <BackBar title="Affiliate" fallbackTo="/profile" />
        <div className={`${card} mt-4 space-y-3 text-center`}>
          <h1 className="text-[20px] font-bold">Ajak teman, dapat komisi</h1>
          <p className="text-[14px] text-muted-foreground">
            Masuk untuk mengaktifkan affiliate dan mendapatkan kode referral kamu.
          </p>
          <CustomerAuth />
        </div>
      </Page>
    );

  const { config, account, stats } = data;
  const origin = typeof window !== "undefined" ? window.location.origin : "https://djiwatravel.com";
  const link = account ? affiliateLink(origin, account.code) : "";
  const copy = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(done);
    } catch {
      setNotice("Tidak bisa menyalin otomatis. Salin manual.");
    }
  };
  const share = async () => {
    if (navigator.share) {
      await navigator
        .share({ title: "Djiwa Travel", text: "Beli eSIM travel lewat link ini:", url: link })
        .catch(() => undefined);
    } else await copy(link, "Link disalin.");
  };

  return (
    <Page>
      <BackBar title="Affiliate" fallbackTo="/profile" />
      {notice && (
        <p role="status" className="mb-3 rounded-xl bg-secondary p-3 text-[13px]">
          {notice}
        </p>
      )}

      {!config.enabled && !account ? (
        <div className={`${card} text-center text-[14px] text-muted-foreground`}>
          Program affiliate sedang tidak aktif. Silakan cek lagi nanti.
        </div>
      ) : !account ? (
        <section className={`${card} space-y-3`}>
          <h1 className="text-[22px] font-bold">Ajak teman, dapat komisi</h1>
          <p className="text-[14px] text-muted-foreground">
            Bagikan satu link Djiwa Travel. Setiap teman yang pertama kali membeli eSIM lewat link
            kamu, komisinya masuk otomatis ke akunmu.
          </p>
          <ul className="space-y-2 rounded-xl border border-border/60 p-3 text-[13px]">
            <li>✓ Aktif satu klik. Kode langsung terbit tanpa form verifikasi.</li>
            <li>✓ Satu link untuk semua produk: beranda, katalog, atau produk tertentu.</li>
            <li>
              ✓ Komisi {config.commissionPercent}% dari margin order pertama temanmu, bukan dari
              harga yang dibayar.
            </li>
            <li>
              ✓ Cair ke saldo Djiwa Pay atau rekening bank, minimal {rupiah(config.minPayoutIdr)}.
            </li>
          </ul>
          <div>
            <h2 className="text-[14px] font-semibold">Cara kerjanya</h2>
            <ol className="mt-2 list-decimal space-y-2 pl-5 text-[13px]">
              <li>Salin link kamu dan bagikan ke teman, grup chat, atau media sosial.</li>
              <li>
                Teman membuka link, lalu masuk atau mendaftar dalam {config.cookieDays} hari.
                Referral otomatis terkunci ke akunmu.
              </li>
              <li>
                Setelah teman menyelesaikan order pertamanya, komisi masuk sebagai
                &quot;Menunggu&quot;. Setelah {config.holdDays} hari tanpa refund, statusnya menjadi
                &quot;Disetujui&quot; dan bisa ditarik.
              </li>
            </ol>
          </div>
          <label className="flex items-start gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={terms}
              onChange={(event) => setTerms(event.target.checked)}
              className="mt-0.5 size-4"
            />
            <span>
              Saya paham komisi tidak dilanjutkan bila order direfund, dibatalkan, atau eSIM gagal
              aktif, dan referral diri sendiri tidak dihitung.
            </span>
          </label>
          <button
            type="button"
            disabled={!terms || busy}
            onClick={() =>
              void run(() => activateAffiliate({ data: { acceptTerms: true } }), "Affiliate aktif.")
            }
            className={`${btnPrimary} w-full disabled:opacity-50`}
          >
            {busy ? "Memproses…" : "Aktifkan Affiliate"}
          </button>
        </section>
      ) : (
        <>
          {account.status === "suspended" && (
            <p
              role="alert"
              className="mb-3 rounded-xl bg-destructive/10 p-3 text-[13px] text-destructive"
            >
              Akun affiliate kamu ditangguhkan. Hubungi support untuk informasi lebih lanjut.
            </p>
          )}
          <section className={`${card} space-y-3`}>
            <p className="text-[12px] text-muted-foreground">
              Kode kamu · komisi {account.percent}%
            </p>
            <div className="rounded-xl border border-dashed border-ring p-3 text-center font-mono text-[20px] font-bold tracking-wider">
              {account.code}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className={ghostBtn}
                onClick={() => void copy(link, "Link disalin.")}
              >
                <Copy className="size-4" aria-hidden="true" /> Salin link
              </button>
              <button
                type="button"
                className={`${ghostBtn} bg-primary text-primary-foreground`}
                onClick={() => void share()}
              >
                <Share2 className="size-4" aria-hidden="true" /> Bagikan
              </button>
            </div>
            <div className="rounded-xl bg-secondary/60 p-3 text-[13px]">
              <h2 className="text-[14px] font-semibold">Cara dapat komisi dari link ini</h2>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Bagikan link kamu ke teman.</li>
                <li>Teman membuka link dan masuk atau mendaftar dalam {config.cookieDays} hari.</li>
                <li>Setelah order pertama teman selesai, komisimu masuk.</li>
              </ol>
              <p className="mt-2 text-[12px] text-muted-foreground">
                Berlaku {config.cookieDays} hari setelah link dibuka · hanya order pertama ·{" "}
                {account.percent}% dari margin
              </p>
              <div className="mt-2">
                <CommissionRules config={config} percent={account.percent} />
              </div>
            </div>
            {account.canChangeCode && account.status === "active" && (
              <div>
                {editCode ? (
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(async () => {
                        await changeAffiliateCode({ data: { code: newCode } });
                        setEditCode(false);
                      }, "Kode diganti.");
                    }}
                  >
                    <input
                      value={newCode}
                      onChange={(event) => setNewCode(event.target.value.toUpperCase())}
                      placeholder="4-16 huruf/angka"
                      maxLength={16}
                      aria-label="Kode baru"
                      className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-[14px]"
                    />
                    <button
                      type="submit"
                      disabled={busy}
                      className="tap h-11 rounded-xl bg-primary px-4 text-[14px] font-semibold text-primary-foreground"
                    >
                      Simpan
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditCode(true)}
                    className="text-[13px] font-medium text-[#0a84ff]"
                  >
                    Ganti kode (sekali saja)
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="mt-3 grid grid-cols-2 gap-2" aria-label="Ringkasan">
            {[
              ["Klik", String(stats.clicks)],
              ["Teman daftar", String(stats.referrals)],
              ["Menunggu", rupiah(stats.pendingIdr)],
              ["Bisa ditarik", rupiah(stats.availableIdr)],
              ["Sedang ditarik", rupiah(stats.requestedIdr)],
              ["Sudah dicairkan", rupiah(stats.paidIdr)],
            ].map(([label, value]) => (
              <div key={label} className={card}>
                <p className="text-[12px] text-muted-foreground">{label}</p>
                <p className="mt-1 text-[17px] font-bold tabular-nums">{value}</p>
              </div>
            ))}
          </section>

          <section className={`${card} mt-3 space-y-3`}>
            <div className="flex items-center justify-between">
              <h2 className="text-[16px] font-bold">Tarik komisi</h2>
              <span className="text-[12px] text-muted-foreground">
                Min. {rupiah(config.minPayoutIdr)}
              </span>
            </div>
            {!payoutOpen ? (
              <button
                type="button"
                disabled={
                  busy ||
                  account.status !== "active" ||
                  stats.availableIdr <= 0 ||
                  stats.availableIdr < config.minPayoutIdr
                }
                onClick={() => setPayoutOpen(true)}
                className={`${btnPrimary} w-full disabled:opacity-50`}
              >
                {stats.availableIdr >= config.minPayoutIdr && stats.availableIdr > 0
                  ? `Tarik ${rupiah(stats.availableIdr)}`
                  : "Saldo belum cukup"}
              </button>
            ) : (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(async () => {
                    await requestAffiliatePayout({
                      data: method === "bank" ? { method, bank } : { method },
                    });
                    setPayoutOpen(false);
                  }, "Penarikan diajukan. Kami tinjau maksimal 1×24 jam kerja.");
                }}
              >
                <fieldset className="space-y-2 text-[14px]">
                  <legend className="mb-1 text-[12px] text-muted-foreground">
                    Tujuan pencairan
                  </legend>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={method === "djiwa_pay"}
                      onChange={() => setMethod("djiwa_pay")}
                    />{" "}
                    Saldo Djiwa Pay
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={method === "bank"}
                      onChange={() => setMethod("bank")}
                    />{" "}
                    Rekening bank
                  </label>
                </fieldset>
                {method === "bank" && (
                  <div className="space-y-2">
                    {(
                      [
                        ["bankName", "Nama bank"],
                        ["accountName", "Nama pemilik rekening"],
                        ["accountNumber", "Nomor rekening"],
                      ] as const
                    ).map(([key, label]) => (
                      <input
                        key={key}
                        value={bank[key]}
                        onChange={(event) => setBank({ ...bank, [key]: event.target.value })}
                        placeholder={label}
                        aria-label={label}
                        inputMode={key === "accountNumber" ? "numeric" : "text"}
                        className="h-11 w-full rounded-xl border border-border bg-background px-3 text-[14px]"
                        required
                      />
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <button type="button" className={ghostBtn} onClick={() => setPayoutOpen(false)}>
                    Batal
                  </button>
                  <button type="submit" disabled={busy} className={`${btnPrimary} flex-1`}>
                    {busy ? "Memproses…" : "Ajukan"}
                  </button>
                </div>
              </form>
            )}
            {data.payouts.length > 0 && (
              <ul className="divide-y divide-border/60 text-[13px]">
                {data.payouts.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-3 py-2">
                    <span>
                      {rupiah(p.amountIdr)} · {p.method === "bank" ? "Bank" : "Djiwa Pay"}
                      <span className="block text-[12px] text-muted-foreground">
                        {dateLabel(p.createdAt)}
                        {p.reference ? ` · ref ${p.reference}` : ""}
                        {p.note ? ` · ${p.note}` : ""}
                      </span>
                    </span>
                    <span className={`shrink-0 font-semibold ${tone[p.status] ?? ""}`}>
                      {PAYOUT_LABEL[p.status as PayoutStatus] ?? p.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={`${card} mt-3`}>
            <h2 className="text-[16px] font-bold">Referral saya</h2>
            {data.referrals.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted-foreground">
                Belum ada teman yang daftar. Bagikan link kamu untuk mulai.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border/60 text-[14px]">
                {data.referrals.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2">
                    <span>
                      {r.name}
                      <span className="block text-[12px] text-muted-foreground">
                        {dateLabel(r.lockedAt)}
                      </span>
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {r.ordered ? "Sudah order" : "Terdaftar"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={`${card} mt-3`}>
            <h2 className="text-[16px] font-bold">Riwayat komisi</h2>
            <div className="mt-2">
              <CommissionRules
                config={config}
                percent={account?.percent ?? config.commissionPercent}
              />
            </div>
            {data.commissions.length === 0 ? (
              <p className="mt-2 text-[13px] text-muted-foreground">
                Komisi muncul setelah teman kamu membayar order pertama.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border/60 text-[14px]">
                {data.commissions.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 py-2">
                    <span>
                      {rupiah(c.amountIdr)}
                      <span className="block text-[12px] text-muted-foreground">
                        {c.status === "pending"
                          ? `Cair setelah ${dateLabel(c.maturesAt)}`
                          : dateLabel(c.createdAt)}
                      </span>
                    </span>
                    <span className={`shrink-0 font-semibold ${tone[c.status] ?? ""}`}>
                      {COMMISSION_LABEL[c.status as CommissionStatus] ?? c.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Page>
  );
}
