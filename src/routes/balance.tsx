import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, Eye, EyeOff, RefreshCw, WalletCards } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Page, SectionTitle } from "@/components/shell";
import { DjiwaPayTopup } from "@/components/djiwa-pay-topup";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";
import { getCustomerWallet, type CustomerWalletResponse, type CustomerWalletLedgerEntry } from "@/lib/customer-wallet.server";
import { groupWalletLedger, ledgerStatusLabel, walletStatusLabel } from "@/lib/customer-wallet-view";
import { rupiah } from "@/lib/pricing";

export const Route = createFileRoute("/balance")({
  head: () => ({
    meta: [
      { title: "Wallet — Djiwa Travel" },
      { name: "description", content: "Kelola Wallet Djiwa Travel dan lihat riwayat transaksi." },
    ],
  }),
  component: Wallet,
});

function maskedId(value: string, visible: boolean) {
  if (visible || value.length <= 6) return value;
  return `${value.slice(0, 3)}••••${value.slice(-3)}`;
}

function Wallet() {
  const { user, loading: authLoading } = useBetterAuthUser();
  const [data, setData] = useState<CustomerWalletResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  const loadWallet = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setData(await getCustomerWallet());
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "Wallet belum dapat dimuat. Coba lagi.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void loadWallet(); }, [loadWallet]);

  const groups = useMemo(() => groupWalletLedger(data?.ledger ?? []), [data?.ledger]);
  const wallet = data?.wallet;
  const formatted = (amount: number) => (visible ? rupiah(amount) : "Rp ••••••");

  return (
    <Page>
      <header className="flex items-center justify-between pt-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-red">Djiwa Travel</p>
          <h1 className="mt-1 text-[28px] font-bold tracking-tight">Wallet</h1>
        </div>
        <button
          type="button"
          className="tap flex min-h-11 min-w-11 items-center justify-center rounded-full bg-surface shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Segarkan Wallet"
          onClick={() => void loadWallet()}
          disabled={loading || authLoading || !user}
        >
          <RefreshCw className={`size-5 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
        </button>
      </header>

      {authLoading ? <WalletLoading /> : !user ? <GuestState /> : loading && !data ? <WalletLoading /> : error ? (
        <ErrorState message={error} onRetry={() => void loadWallet()} />
      ) : !wallet ? (
        <EmptyState />
      ) : (
        <>
          <section className="relative mt-5 overflow-hidden rounded-[26px] bg-primary p-5 text-primary-foreground shadow-lg" aria-labelledby="wallet-card-title">
            <div className="absolute -right-10 -top-12 size-40 rounded-full bg-white/10" aria-hidden="true" />
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p id="wallet-card-title" className="text-sm font-semibold text-primary-foreground/75">Wallet Djiwa Pay</p>
                  <p className="mt-1 text-xs text-primary-foreground/65">IDR · {walletStatusLabel(wallet.status)}</p>
                </div>
                <WalletCards className="size-7" aria-hidden="true" />
              </div>
              <p className="mt-7 text-xs text-primary-foreground/70">Saldo tersedia</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-[30px] font-bold tracking-tight">{formatted(wallet.available_balance)}</p>
                <button type="button" onClick={() => setVisible((current) => !current)} className="tap flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label={visible ? "Sembunyikan saldo" : "Tampilkan saldo"}>
                  {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
                </button>
              </div>
              <p className="mt-4 text-xs text-primary-foreground/70">ID Wallet · {maskedId(wallet.customer_id, visible)}</p>
            </div>
          </section>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Summary label="Total masuk" value={formatted(wallet.total_credited)} icon={ArrowDownLeft} tone="text-emerald-700" />
            <Summary label="Total digunakan" value={formatted(wallet.total_debited)} icon={ArrowUpRight} tone="text-brand-red" />
          </div>

          <DjiwaPayTopup userId={user.id} />

          <section className="mt-7" aria-labelledby="wallet-history-title">
            <SectionTitle action={<span className="text-xs font-normal normal-case">{data.ledger.length} transaksi</span>}>
              <span id="wallet-history-title">Riwayat Wallet</span>
            </SectionTitle>
            {groups.length === 0 ? <p className="rounded-2xl bg-surface px-4 py-5 text-sm text-muted-foreground">Belum ada transaksi Wallet.</p> : <div className="space-y-5">{groups.map((group) => <div key={group.key}><h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h3><div className="overflow-hidden rounded-2xl bg-surface">{group.entries.map((entry) => <LedgerRow key={String(entry.id)} entry={entry} visible={visible} />)}</div></div>)}</div>}
          </section>
        </>
      )}
    </Page>
  );
}

function Summary({ label, value, icon: Icon, tone }: { label: string; value: string; icon: typeof ArrowDownLeft; tone: string }) {
  return <div className="rounded-2xl bg-surface p-3.5"><Icon className={`size-5 ${tone}`} aria-hidden="true" /><p className="mt-3 text-xs text-muted-foreground">{label}</p><p className="mt-1 truncate text-sm font-bold">{value}</p></div>;
}

function LedgerRow({ entry, visible }: { entry: CustomerWalletLedgerEntry; visible: boolean }) {
  const credit = entry.direction === "credit";
  const date = new Date(entry.created_at);
  const title = entry.note || entry.transaction_type;
  const reference = [entry.reference_type, entry.reference_id].filter(Boolean).join(" · ");
  const StatusIcon = credit ? ArrowDownLeft : ArrowUpRight;
  return <div className="flex items-center gap-3 border-b px-4 py-3.5 last:border-b-0"><span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${credit ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-brand-red"}`}><StatusIcon className="size-4" aria-hidden="true" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{title}</p><p className="truncate text-xs text-muted-foreground">{date.toLocaleDateString("id-ID")} · {ledgerStatusLabel(entry.status)}{reference ? ` · ${reference}` : ""}</p></div><p className={`shrink-0 text-sm font-bold ${credit ? "text-emerald-700" : "text-brand-red"}`}>{visible ? `${credit ? "+" : "−"}${rupiah(entry.amount)}` : "••••••"}</p></div>;
}

function WalletLoading() { return <div className="mt-5 space-y-4" role="status" aria-label="Memuat Wallet"><div className="h-52 animate-pulse rounded-[26px] bg-secondary" /><div className="grid grid-cols-2 gap-3"><div className="h-24 animate-pulse rounded-2xl bg-secondary" /><div className="h-24 animate-pulse rounded-2xl bg-secondary" /></div><div className="h-44 animate-pulse rounded-2xl bg-secondary" /></div>; }
function GuestState() { return <div className="mt-5 rounded-3xl bg-surface p-6 text-center shadow-sm"><WalletCards className="mx-auto size-10 text-muted-foreground" aria-hidden="true" /><h2 className="mt-4 text-lg font-bold">Masuk untuk membuka Wallet</h2><p className="mt-2 text-sm leading-5 text-muted-foreground">Wallet tersedia untuk akun Djiwa Travel yang sudah masuk.</p></div>; }
function EmptyState() { return <div className="mt-5 rounded-3xl bg-surface p-6 text-center shadow-sm"><WalletCards className="mx-auto size-10 text-muted-foreground" aria-hidden="true" /><h2 className="mt-4 text-lg font-bold">Wallet belum tersedia</h2><p className="mt-2 text-sm leading-5 text-muted-foreground">Kami belum menemukan Wallet untuk akun ini. Coba segarkan atau hubungi bantuan jika akunmu sudah terdaftar.</p></div>; }
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="mt-5 rounded-3xl bg-surface p-6 text-center shadow-sm"><h2 className="text-lg font-bold">Wallet belum dapat dimuat</h2><p className="mt-2 text-sm leading-5 text-muted-foreground">{message}</p><button type="button" onClick={onRetry} className="mt-5 min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground">Coba lagi</button></div>; }
