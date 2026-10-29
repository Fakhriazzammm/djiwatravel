import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Eye,
  EyeOff,
  ExternalLink,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Page, SectionTitle, Wordmark } from "@/components/shell";
import { DjiwaPayTopup, TOPUP_PENDING_KEY } from "@/components/djiwa-pay-topup";
import { FixedLayer } from "@/components/motion-primitives";
import { PendingSpinner } from "@/components/route-loading";
import { ACTION_STAGES, useStagedLabel } from "@/lib/progress-stages";
import { getCustomerAppConfig } from "@/lib/customer-app-config.server";
import { DEFAULT_TOPUP_PRESETS, DEFAULT_MINIMUM_TOPUP } from "@/lib/customer-app-config";

import { useBetterAuthUser } from "@/lib/use-better-auth-user";
import {
  getCustomerWallet,
  type CustomerWalletResponse,
  type CustomerWalletLedgerEntry,
} from "@/lib/customer-wallet.server";
import {
  groupWalletLedger,
  ledgerStatusLabel,
  walletStatusLabel,
} from "@/lib/customer-wallet-view";
import { WALLET_SCOPES, WALLET_SCOPE_LABELS, type WalletScope } from "@/lib/wallet-scope";
import { rupiah } from "@/lib/pricing";
import {
  QUICK_ACTION_SUPPORT_COPY,
  quickActionSoonCopy,
  WALLET_ACTIONS,
  type WalletQuickAction,
} from "@/lib/wallet-quick-actions";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — Djiwa Travel" },
      { name: "description", content: "Kelola Wallet Djiwa Travel dan lihat riwayat transaksi." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Wallet,
});

function maskedId(value: string, visible: boolean) {
  if (visible || value.length <= 6) return value;
  return `${value.slice(0, 3)}••••${value.slice(-3)}`;
}

export function Wallet() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { user, loading: authLoading } = useBetterAuthUser();
  const [data, setData] = useState<CustomerWalletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const walletLoadingLabel = useStagedLabel(loading, ACTION_STAGES.walletLoad);
  const [error, setError] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [scope, setScope] = useState<WalletScope>("all");
  const [quickActionDialog, setQuickActionDialog] = useState<string | null>(null);
  // Presets and which quick actions are live come from the server; the shipped defaults render
  // immediately so the screen never waits on the config round-trip.
  const [walletActions, setWalletActions] = useState<readonly WalletQuickAction[]>(WALLET_ACTIONS);
  const [topupPresets, setTopupPresets] = useState<readonly number[]>(DEFAULT_TOPUP_PRESETS);
  const [topupMinimum, setTopupMinimum] = useState(DEFAULT_MINIMUM_TOPUP);
  useEffect(() => {
    let cancelled = false;
    void getCustomerAppConfig()
      .then((config) => {
        if (cancelled) return;
        if (config.walletActions.length > 0) setWalletActions(config.walletActions);
        if (config.topup.presets.length > 0) setTopupPresets(config.topup.presets);
        if (config.topup.minimum >= DEFAULT_MINIMUM_TOPUP) setTopupMinimum(config.topup.minimum);
      })
      .catch(() => {
        // Keep the shipped defaults; a config failure must not disable top up.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const [topupOpen, setTopupOpen] = useState(false);
  const [topupPending, setTopupPending] = useState<{
    amount: number;
    startedAt: number;
    creditedBefore: number;
  } | null>(null);
  const [topupVerifiedAmount, setTopupVerifiedAmount] = useState(0);
  const [topupTimedOut, setTopupTimedOut] = useState(false);

  function focusWalletSection(selector: "#wallet-history-title") {
    const target = document.querySelector<HTMLElement>(selector);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    target?.focus({ preventScroll: true });
  }

  function handleQuickAction(label: string) {
    if (label === "Isi Saldo") setTopupOpen(true);
    else if (label === "Riwayat") focusWalletSection("#wallet-history-title");
    else setQuickActionDialog(label);
  }

  const loadWallet = useCallback(async (): Promise<CustomerWalletResponse | null> => {
    if (!user) return null;
    setLoading(true);
    setError(null);
    try {
      const next = await getCustomerWallet({ data: { scope } });
      setData(next);
      return next;
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "Wallet belum dapat dimuat. Coba lagi.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [user, scope]);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  const topupPendingKey = user ? `${TOPUP_PENDING_KEY}:${user.id}` : TOPUP_PENDING_KEY;
  useEffect(() => {
    if (!user) return;
    try {
      const raw = window.sessionStorage.getItem(topupPendingKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        amount?: number;
        startedAt?: number;
        creditedBefore?: number;
      };
      if (
        Number.isFinite(parsed.amount) &&
        Number.isFinite(parsed.startedAt) &&
        Date.now() - Number(parsed.startedAt) < 10 * 60_000
      ) {
        setTopupPending({
          amount: Number(parsed.amount),
          startedAt: Number(parsed.startedAt),
          creditedBefore: Number(parsed.creditedBefore ?? 0),
        });
      } else {
        window.sessionStorage.removeItem(topupPendingKey);
        setTopupTimedOut(true);
      }
    } catch {
      /* Abaikan session marker yang rusak. */
    }
  }, [topupPendingKey, user]);

  useEffect(() => {
    if (!topupPending) return;
    let active = true;
    const verify = async () => {
      try {
        const latest = await loadWallet();
        if (!active) return;
        if (
          Number(latest?.wallet?.total_credited ?? 0) >=
          topupPending.creditedBefore + topupPending.amount
        ) {
          setTopupVerifiedAmount(topupPending.amount);
          setTopupPending(null);
          window.sessionStorage.removeItem(topupPendingKey);
        } else if (Date.now() - topupPending.startedAt >= 10 * 60_000) {
          setTopupPending(null);
          setTopupTimedOut(true);
          window.sessionStorage.removeItem(topupPendingKey);
        }
      } catch {
        /* Keep the truthful pending state when a read is temporarily unavailable. */
      }
    };
    void verify();
    const timer = window.setInterval(() => void verify(), 7_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [loadWallet, topupPending, topupPendingKey]);

  async function checkWalletAgain() {
    setTopupTimedOut(false);
    try {
      await loadWallet();
    } finally {
      setTopupTimedOut(true);
    }
  }

  const groups = useMemo(() => groupWalletLedger(data?.ledger ?? []), [data?.ledger]);
  const wallet = data?.wallet;
  const formatted = (amount: number) => (visible ? rupiah(amount) : "Rp ••••••");
  const initialLoading = authLoading || Boolean(user && loading && !data);

  if (initialLoading) {
    return (
      <Page>
        {pathname !== "/wallet/pay" && <WalletLoadingSplash />}
        <Outlet />
      </Page>
    );
  }

  return (
    <Page>
      <header className="flex items-center justify-between pt-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-red">
            Djiwa Travel
          </p>
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

      {!user ? (
        <GuestState />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void loadWallet()} />
      ) : !wallet ? (
        <EmptyState />
      ) : (
        <>
          <section
            className="relative mt-5 overflow-hidden rounded-[26px] bg-primary p-5 text-primary-foreground shadow-lg"
            aria-labelledby="wallet-card-title"
          >
            <div
              className="absolute -right-10 -top-12 size-40 rounded-full bg-white/10"
              aria-hidden="true"
            />
            <div className="relative">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p
                    id="wallet-card-title"
                    className="text-sm font-semibold text-primary-foreground/75"
                  >
                    Wallet Djiwa Pay
                  </p>
                  <p className="mt-1 text-xs text-primary-foreground/65">
                    IDR · {walletStatusLabel(wallet.status)}
                  </p>
                </div>
                <WalletCards className="size-7" aria-hidden="true" />
              </div>
              <p className="mt-7 text-xs text-primary-foreground/70">Saldo tersedia</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="text-[30px] font-bold tracking-tight">
                  {formatted(wallet.available_balance)}
                </p>
                <button
                  type="button"
                  onClick={() => setVisible((current) => !current)}
                  className="tap flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label={visible ? "Sembunyikan saldo" : "Tampilkan saldo"}
                >
                  {visible ? (
                    <EyeOff className="size-5" aria-hidden="true" />
                  ) : (
                    <Eye className="size-5" aria-hidden="true" />
                  )}
                </button>
              </div>
              <p className="mt-4 text-xs text-primary-foreground/70">
                ID Wallet · {maskedId(wallet.customer_id, visible)}
              </p>
            </div>
          </section>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Summary
              label="Total masuk"
              value={formatted(wallet.total_credited)}
              icon={ArrowDownLeft}
              tone="text-emerald-700"
            />
            <Summary
              label="Total digunakan"
              value={formatted(wallet.total_debited)}
              icon={ArrowUpRight}
              tone="text-brand-red"
            />
          </div>

          <section className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm">
            <div className="min-w-0">
              <p className="text-sm font-bold">Kelola lebih lengkap di Djiwa Pay</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Buka layanan pembayaran tanpa meninggalkan navbar Djiwa Travel.
              </p>
            </div>
            <a
              href="/wallet/pay"
              className="tap inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-brand-red px-3 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
            >
              Buka Djiwa Pay
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </section>

          <section
            className="mt-5 rounded-[22px] bg-surface p-4 shadow-sm sm:p-5"
            aria-label="Aksi cepat"
          >
            <div className="grid grid-cols-4 gap-2" aria-label="Aksi cepat">
              {walletActions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className="tap relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={action.supported ? action.label : `${action.label}, segera hadir`}
                  onClick={() => handleQuickAction(action.label)}
                >
                  <img src={action.asset} alt="" className="size-9 object-contain" />
                  <span className="text-[11px] font-semibold leading-tight">{action.label}</span>
                  {!action.supported && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white ${action.badgeClass ?? "bg-secondary"}`}
                    >
                      Soon
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {topupPending && (
            <section
              className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"
              role="status"
              aria-live="polite"
            >
              <p className="text-sm font-bold">Menunggu konfirmasi pembayaran</p>
              <p className="mt-1 text-xs leading-5 text-emerald-800">
                Pembayaran sedang diverifikasi. Wallet akan diperbarui otomatis setelah konfirmasi
                diterima.
              </p>
            </section>
          )}
          {topupVerifiedAmount > 0 && !topupPending && (
            <section
              className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950"
              role="status"
            >
              <p className="text-sm font-bold">Top up berhasil</p>
              <p className="mt-1 text-xs leading-5 text-emerald-800">
                Wallet bertambah {rupiah(topupVerifiedAmount)} dan sudah dikonfirmasi.
              </p>
            </section>
          )}
          {topupTimedOut && !topupPending && (
            <section
              className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
              role="status"
            >
              <p className="text-sm font-bold">Pembayaran sedang diverifikasi</p>
              <p className="mt-1 text-xs leading-5 text-amber-900">
                Wallet belum berubah. Jangan membuat top up baru; cek kembali setelah beberapa saat.
              </p>
              <button
                type="button"
                onClick={() => void checkWalletAgain()}
                disabled={loading}
                className="tap mt-3 min-h-11 rounded-xl bg-amber-600 px-3 text-xs font-bold text-white disabled:opacity-60"
              >
                {loading ? walletLoadingLabel : "Cek saldo lagi"}
              </button>
            </section>
          )}
          <DjiwaPayTopup
            userId={user.id}
            open={topupOpen}
            onOpenChange={setTopupOpen}
            creditedBefore={Number(wallet.total_credited)}
            presets={topupPresets}
            minimum={topupMinimum}
            onSubmitted={(pending) => {
              setTopupTimedOut(false);
              setTopupVerifiedAmount(0);
              setTopupPending(pending);
            }}
          />

          <section className="mt-7" aria-labelledby="wallet-history-title">
            <SectionTitle
              action={
                <span className="text-xs font-normal normal-case">
                  {data.ledger.length} transaksi
                </span>
              }
            >
              <span id="wallet-history-title" tabIndex={-1}>
                Riwayat Wallet
              </span>
            </SectionTitle>
            <div
              className="mt-3 flex flex-wrap gap-2"
              role="group"
              aria-label="Filter riwayat Wallet"
            >
              {WALLET_SCOPES.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={scope === option}
                  onClick={() => setScope(option)}
                  disabled={loading}
                  className={`tap min-h-11 rounded-full border px-3.5 text-xs font-semibold disabled:opacity-60 ${scope === option ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground"}`}
                >
                  {WALLET_SCOPE_LABELS[option]}
                </button>
              ))}
            </div>
            {scope === "djiwa-travel" && (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Menampilkan transaksi yang tercatat berasal dari Djiwa Travel. Transaksi tanpa
                keterangan asal aplikasi tidak ditampilkan.
              </p>
            )}
            {groups.length === 0 ? (
              <p className="mt-3 rounded-2xl bg-surface px-4 py-5 text-sm text-muted-foreground">
                {scope === "djiwa-travel"
                  ? "Belum ada transaksi Djiwa Travel yang tercatat."
                  : "Belum ada transaksi Wallet."}
              </p>
            ) : (
              <div className="mt-3 space-y-5">
                {groups.map((group) => (
                  <div key={group.key}>
                    <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </h3>
                    <div className="overflow-hidden rounded-2xl bg-surface">
                      {group.entries.map((entry) => (
                        <LedgerRow key={String(entry.id)} entry={entry} visible={visible} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
      {quickActionDialog && (
        <FixedLayer>
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
            role="presentation"
            onClick={(event) => {
              if (event.target === event.currentTarget) setQuickActionDialog(null);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="wallet-quick-action-dialog-title"
              className="w-full max-w-md rounded-3xl bg-surface p-5 shadow-xl"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Djiwa Pay
              </p>
              <h2 id="wallet-quick-action-dialog-title" className="mt-1 text-xl font-bold">
                Segera Hadir
              </h2>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">
                {quickActionDialog === "Bantuan"
                  ? QUICK_ACTION_SUPPORT_COPY
                  : quickActionSoonCopy(quickActionDialog)}
              </p>
              {quickActionDialog === "Bantuan" && (
                <a
                  className="mt-3 inline-flex min-h-11 items-center font-semibold text-brand-red underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  href="https://wa.me/6285156399831"
                  target="_blank"
                  rel="noreferrer"
                >
                  Hubungi customer service
                </a>
              )}
              <button
                type="button"
                className="mt-4 min-h-11 w-full rounded-xl bg-primary px-4 font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setQuickActionDialog(null)}
              >
                Mengerti
              </button>
            </div>
          </div>
        </FixedLayer>
      )}
      <Outlet />
    </Page>
  );
}

function Summary({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof ArrowDownLeft;
  tone: string;
}) {
  return (
    <div className="rounded-2xl bg-surface p-3.5">
      <Icon className={`size-5 ${tone}`} aria-hidden="true" />
      <p className="mt-3 text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-bold">{value}</p>
    </div>
  );
}

function LedgerRow({ entry, visible }: { entry: CustomerWalletLedgerEntry; visible: boolean }) {
  const credit = entry.direction === "credit";
  const date = new Date(entry.created_at);
  const title = entry.note || entry.transaction_type;
  const reference = [entry.reference_type, entry.reference_id].filter(Boolean).join(" · ");
  const StatusIcon = credit ? ArrowDownLeft : ArrowUpRight;
  return (
    <div className="flex items-center gap-3 border-b px-4 py-3.5 last:border-b-0">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${credit ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-brand-red"}`}
      >
        <StatusIcon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {date.toLocaleDateString("id-ID")} · {ledgerStatusLabel(entry.status)}
          {reference ? ` · ${reference}` : ""}
        </p>
      </div>
      <p className={`shrink-0 text-sm font-bold ${credit ? "text-emerald-700" : "text-brand-red"}`}>
        {visible ? `${credit ? "+" : "−"}${rupiah(entry.amount)}` : "••••••"}
      </p>
    </div>
  );
}

function WalletLoadingSplash() {
  const reduce = useReducedMotion();
  return (
    <FixedLayer>
      <main
        data-testid="wallet-loading-splash"
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="fixed inset-0 z-[70] flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-background px-6 text-center"
      >
        <Wordmark className="h-12" />
        <PendingSpinner reduce={!!reduce} className="size-14" />
        <div className="flex flex-col gap-1">
          <p className="text-[15px] font-semibold text-foreground">Menyiapkan Wallet…</p>
          <p className="text-[13px] text-muted-foreground">Memuat data Wallet Djiwa Pay.</p>
        </div>
      </main>
    </FixedLayer>
  );
}

function GuestState() {
  return (
    <div className="mt-5 rounded-3xl bg-surface p-6 text-center shadow-sm">
      <WalletCards className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-bold">Masuk untuk membuka Wallet</h2>
      <p className="mt-2 text-sm leading-5 text-muted-foreground">
        Wallet tersedia untuk akun Djiwa Travel yang sudah masuk.
      </p>
    </div>
  );
}
function EmptyState() {
  return (
    <div className="mt-5 rounded-3xl bg-surface p-6 text-center shadow-sm">
      <WalletCards className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-4 text-lg font-bold">Wallet belum tersedia</h2>
      <p className="mt-2 text-sm leading-5 text-muted-foreground">
        Kami belum menemukan Wallet untuk akun ini. Coba segarkan atau hubungi bantuan jika akunmu
        sudah terdaftar.
      </p>
    </div>
  );
}
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mt-5 rounded-3xl bg-surface p-6 text-center shadow-sm">
      <h2 className="text-lg font-bold">Wallet belum dapat dimuat</h2>
      <p className="mt-2 text-sm leading-5 text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 min-h-11 rounded-xl bg-primary px-5 font-semibold text-primary-foreground"
      >
        Coba lagi
      </button>
      <a
        href="/wallet/pay"
        className="tap mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-brand-red px-4 text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red"
      >
        Buka Djiwa Pay
        <ExternalLink className="size-3.5" aria-hidden="true" />
      </a>
    </div>
  );
}
