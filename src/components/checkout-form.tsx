import { QrCode, WalletCards, Check } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { StickyCta, btnRed, group, label } from "@/components/shell";
import { loadCheckout } from "@/lib/checkout-load.fn";
import { rupiah } from "@/lib/pricing";
import { getCustomerWallet } from "@/lib/customer-wallet.fn";
import { createOrder } from "@/lib/orders";
import {
  packageCoverageLabel,
  packageDataLabel,
  packageDestinationLabel,
} from "@/lib/package-copy";
import { getBetterAuthSession, type BetterAuthUser } from "@/lib/better-auth-client";
import { isCustomerProfileComplete } from "@/lib/customer-profile";
import { formatWhatsapp, isValidWhatsapp, normalizeWhatsapp } from "@/lib/phone";
import { CUSTOMER_PROFILE_UPDATED_EVENT, loadCustomerProfile } from "@/lib/customer-profile-client";
import { DeviceCompatibility } from "@/components/device-compatibility";
import { nextFrame, paymentProgressLabel, type PaymentProgressStage } from "@/lib/payment-progress";
import { trackAnalytics } from "@/lib/analytics";
import {
  mayarRedirectUrl,
  walletPaymentAvailability,
  type NewCheckoutPaymentMethod,
} from "@/lib/travel-payment-method";

const methods = [
  {
    id: "qris",
    label: "QRIS",
    desc: "Bayar pakai GoPay, OVO, DANA, ShopeePay, LinkAja, atau m-banking.",
    icon: QrCode,
  },
  {
    id: "djiwa_pay",
    label: "Djiwa Pay",
    desc: "Recommended · Saldo Djiwa Pay langsung dipotong, tanpa pindah halaman.",
    icon: WalletCards,
  },
] as const;

function Footer({ sheet, children }: { sheet: boolean; children: ReactNode }) {
  return sheet ? (
    <div className="mt-5 pb-1">{children}</div>
  ) : (
    <>
      {/* Reserves room for the pinned bar so the last payment options scroll above it. */}
      <div aria-hidden="true" className="h-40" />
      <StickyCta aboveTabBar={false}>{children}</StickyCta>
    </>
  );
}

export type CheckoutFormData = Awaited<ReturnType<typeof loadCheckout>>;

/**
 * The checkout form shared by the full page (`/checkout/$id`) and the Home bottom sheet, so the
 * payment rules (member-only, profile gate, wallet balance, redirect) cannot diverge.
 */
export function CheckoutForm({
  pkg,
  djiwaPayEnabled,
  variant = "page",
}: CheckoutFormData & { variant?: "page" | "sheet" }) {
  const price = pkg.priceIdr;
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [wa, setWa] = useState("");
  const [method, setMethod] = useState<NewCheckoutPaymentMethod>("qris");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [paymentProgress, setPaymentProgress] = useState<PaymentProgressStage>("idle");
  const [user, setUser] = useState<BetterAuthUser | null>(null);
  const [memberProfileReady, setMemberProfileReady] = useState(false);
  // undefined = loading, null = unavailable, number = available Djiwa Pay balance (IDR).
  const [walletBalance, setWalletBalance] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (!djiwaPayEnabled || !user || !memberProfileReady) return;
    let cancelled = false;
    setWalletBalance(undefined);
    getCustomerWallet({ data: { scope: "all" } })
      .then((res) => {
        if (!cancelled) setWalletBalance(res.wallet ? res.wallet.available_balance : null);
      })
      .catch(() => {
        if (!cancelled) setWalletBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [djiwaPayEnabled, user, memberProfileReady]);
  useEffect(() => {
    void getBetterAuthSession()
      .then((session) => {
        const nextUser = session?.user ?? null;
        setUser(nextUser);
        if (nextUser) {
          void loadCustomerProfile()
            .then((saved) => {
              if (saved) {
                setEmail(saved.email);
                setWa(saved.whatsapp);
              }
              setMemberProfileReady(Boolean(saved && isCustomerProfileComplete(saved)));
            })
            .catch(() => setMemberProfileReady(false));
        }
      })
      .catch(() => setUser(null));
  }, []);
  useEffect(() => {
    const onProfileUpdated = (event: Event) => {
      const saved = (event as CustomEvent<{ email: string; whatsapp: string }>).detail;
      if (!saved) return;
      setEmail(saved.email);
      setWa(saved.whatsapp);
      setMemberProfileReady(isCustomerProfileComplete(saved));
    };
    window.addEventListener(CUSTOMER_PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => window.removeEventListener(CUSTOMER_PROFILE_UPDATED_EVENT, onProfileUpdated);
  }, []);
  const valid = isCustomerProfileComplete({ email, whatsapp: wa });
  const walletAvailability = walletPaymentAvailability({
    enabled: djiwaPayEnabled,
    authenticated: Boolean(user),
    profileComplete: memberProfileReady,
  });
  // Every order belongs to a verified account, so checkout needs a signed-in member with a
  // complete profile. Guest checkout is retired.
  const canPay =
    Boolean(user) &&
    valid &&
    memberProfileReady &&
    (method !== "djiwa_pay" ||
      (walletAvailability === "available" &&
        !(typeof walletBalance === "number" && walletBalance < price)));
  const insufficientBalance =
    method === "djiwa_pay" && typeof walletBalance === "number" && walletBalance < price;

  const pay = async () => {
    if (submitting) return;
    trackAnalytics("checkout_start", `/plan/${pkg.packageCode}`);
    setSubmitting(true);
    setPaymentProgress("preparing");
    setError("");
    try {
      const o = await createOrder({
        packageId: pkg.packageCode,
        amount: price,
        email: email.trim(),
        whatsapp: normalizeWhatsapp(wa),
        method,
      });
      // Go straight to the payment page: leaving the customer on the order screen when a
      // payment link already exists is a dead end they asked us to remove.
      const redirectUrl = mayarRedirectUrl(method, o.paymentUrl);
      if (redirectUrl) {
        setPaymentProgress("redirecting");
        await nextFrame();
        window.location.assign(redirectUrl);
        return;
      }
      nav({ to: "/order/$id", params: { id: o.id } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setError(
        message.includes("sedang diproses")
          ? message
          : "Pesanan belum dapat disimpan. Coba kembali beberapa saat lagi.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const input =
    "w-full bg-transparent h-12 px-4 text-[16px] outline-none placeholder:text-muted-foreground";
  const sheet = variant === "sheet";
  return (
    <>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm"
        >
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 rounded-2xl bg-surface p-4">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-xl"
          aria-hidden="true"
        >
          🌐
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">Paket internet</p>
          <p className="font-semibold">{packageDestinationLabel(pkg)}</p>
          <p className="text-sm text-muted-foreground">
            {packageDataLabel(pkg)} · {pkg.durationDays} hari masa aktif
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Cakupan: {packageCoverageLabel(pkg)}</p>
        </div>
        <p className="shrink-0 text-right text-sm font-bold">{rupiah(price)}</p>
      </div>

      <h2 className={`${label} mt-6`}>Dikirim ke</h2>
      {!user && (
        <div className="mb-3 rounded-2xl border border-brand-red/20 bg-brand-red-soft p-3 text-sm">
          <p className="font-semibold">Masuk untuk checkout</p>
          <p className="mt-1 text-muted-foreground">
            Pesanan disimpan ke akunmu agar bisa dibuka di perangkat mana pun.
          </p>
          <Link
            to="/profile"
            search={{
              admin: undefined,
              returnTo: `/checkout/${pkg.packageCode}`,
              calendar: undefined,
              calendarSync: undefined,
            }}
            className="mt-2 inline-flex font-semibold text-brand-red"
          >
            Masuk di Profil →
          </Link>
        </div>
      )}
      {user && !memberProfileReady && (
        <div className="mb-3 rounded-2xl border border-brand-red/20 bg-brand-red-soft p-3 text-sm">
          <p className="font-semibold">Lengkapi profil untuk checkout</p>
          <p className="mt-1 text-muted-foreground">Email dan nomor WhatsApp wajib diisi.</p>
          <Link
            to="/profile"
            search={{
              admin: undefined,
              returnTo: undefined,
              calendar: undefined,
              calendarSync: undefined,
            }}
            className="mt-2 inline-flex font-semibold text-brand-red"
          >
            Lengkapi data di Profil →
          </Link>
        </div>
      )}
      {user && (
        <>
          <div className={group}>
            <input
              className={input}
              type="email"
              inputMode="email"
              placeholder="Email"
              aria-label="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmail((value) => value.trim())}
            />
            <input
              className={input}
              type="tel"
              inputMode="tel"
              placeholder="Nomor WhatsApp (0812… atau 62812…)"
              aria-label="Nomor WhatsApp"
              value={wa}
              onChange={(e) => setWa(e.target.value)}
              onBlur={() =>
                setWa((value) => (isValidWhatsapp(value) ? formatWhatsapp(value) : value))
              }
            />
          </div>
          {wa.trim() !== "" && !isValidWhatsapp(wa) && (
            <p role="alert" className="mt-2 px-1 text-xs text-destructive">
              Nomor WhatsApp belum valid. Contoh: 08123456789.
            </p>
          )}
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            {user ? "Masuk sebagai member." : "Tanpa perlu daftar akun."} Boleh ketik 0812… — kami
            ubah otomatis ke format 62….
          </p>
        </>
      )}
      <DeviceCompatibility />

      <h2 className={`${label} mt-6`}>Pembayaran</h2>
      <div className={group}>
        {methods.map(({ id, label: name, desc, icon: I }) => (
          <button
            key={id}
            onClick={() => setMethod(id)}
            aria-pressed={method === id}
            className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <I className="size-6 shrink-0 text-primary" strokeWidth={1.6} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
              {id === "djiwa_pay" && walletAvailability === "available" && (
                <p
                  className={`mt-0.5 text-xs font-semibold ${walletBalance !== undefined && walletBalance !== null && walletBalance < price ? "text-destructive" : "text-foreground"}`}
                >
                  {walletBalance === undefined
                    ? "Memuat saldo…"
                    : walletBalance === null
                      ? "Saldo belum dapat dimuat"
                      : `Saldo kamu: ${rupiah(walletBalance)}`}
                </p>
              )}
            </div>
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${method === id ? "border-brand-red bg-brand-red" : ""}`}
            >
              {method === id && (
                <Check className="size-3 text-primary-foreground" strokeWidth={3} />
              )}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        Pembayaran kamu aman dan dilindungi ketentuan perlindungan konsumen di Indonesia.
      </p>
      {method === "djiwa_pay" && walletAvailability !== "available" && (
        <div className="mt-3 rounded-2xl border border-brand-red/20 bg-brand-red-soft p-3 text-sm">
          {walletAvailability === "sign_in" ? (
            <>
              <p>Masuk sebagai member untuk membayar langsung dari saldo Djiwa Pay.</p>
              <Link
                to="/profile"
                search={{
                  admin: undefined,
                  returnTo: undefined,
                  calendar: undefined,
                  calendarSync: undefined,
                }}
                className="mt-2 inline-flex font-semibold text-brand-red"
              >
                Masuk atau buka Profil →
              </Link>
            </>
          ) : walletAvailability === "complete_profile" ? (
            <>
              <p>Lengkapi profil member untuk menggunakan saldo Djiwa Pay.</p>
              <Link
                to="/profile"
                search={{
                  admin: undefined,
                  returnTo: undefined,
                  calendar: undefined,
                  calendarSync: undefined,
                }}
                className="mt-2 inline-flex font-semibold text-brand-red"
              >
                Lengkapi Profil →
              </Link>
            </>
          ) : (
            <p>Pembayaran saldo Djiwa Pay belum dikonfigurasi di server.</p>
          )}
        </div>
      )}

      <Footer sheet={sheet}>
        {!pkg.sellable && (
          <p className="pb-2 text-center text-xs font-semibold text-destructive">
            Paket ini sedang tidak tersedia. Silakan pilih paket lain.
          </p>
        )}
        {!canPay && !submitting && pkg.sellable && (
          <p className="pb-2 text-center text-xs text-muted-foreground">
            {!user
              ? "Masuk ke akun untuk melanjutkan checkout."
              : !valid
                ? "Isi email dan nomor WhatsApp yang valid untuk melanjutkan."
                : method === "djiwa_pay"
                  ? walletAvailability === "sign_in"
                    ? "Masuk ke akun member untuk membayar dengan saldo Djiwa Pay."
                    : walletAvailability === "complete_profile"
                      ? "Lengkapi profil untuk membayar dengan saldo Djiwa Pay."
                      : insufficientBalance
                        ? "Saldo Djiwa Pay tidak cukup. Top up di menu Dompet atau pilih QRIS."
                        : "Pembayaran saldo Djiwa Pay belum aktif."
                  : "Lengkapi data pengiriman di Profil untuk melanjutkan checkout."}
          </p>
        )}
        <button
          disabled={!canPay || submitting || !pkg.sellable}
          onClick={pay}
          className={`${btnRed} disabled:opacity-40`}
        >
          {submitting
            ? paymentProgressLabel(paymentProgress)
            : pkg.sellable
              ? method === "djiwa_pay"
                ? `Bayar dengan Djiwa Pay · ${rupiah(price)}`
                : `Buat pesanan · ${rupiah(price)}`
              : "Habis"}
        </button>
      </Footer>
    </>
  );
}
