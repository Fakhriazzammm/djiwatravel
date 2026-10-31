import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { QrCode, WalletCards, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Page, BackBar, StickyCta, btnRed, group, label } from "@/components/shell";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { loadLiveResellerPackage } from "@/lib/esim-access-catalog";
import { resolveCheckoutPackage } from "@/lib/checkout-package";
import { getSellabilityState } from "@/lib/sellability.server";
import { rupiah } from "@/lib/pricing";
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
import { toViewPackage } from "@/lib/package-view";
import { DeviceCompatibility } from "@/components/device-compatibility";
import { nextFrame, paymentProgressLabel, type PaymentProgressStage } from "@/lib/payment-progress";
import { trackAnalytics } from "@/lib/analytics";
import {
  mayarRedirectUrl,
  walletPaymentAvailability,
  type NewCheckoutPaymentMethod,
} from "@/lib/travel-payment-method";

const loadCheckout = createServerFn({ method: "GET" })
  .validator(z.string().trim().min(1).max(160))
  .handler(async ({ data }) => {
    // Price the page from the provider's current catalogue, so what the customer sees is what the
    // order is created with (and what the provider will accept).
    const live = await loadLiveResellerPackage(data).catch(() => null);
    const catalog = await getResellerCatalog();
    const pkg = live ?? resolveCheckoutPackage(catalog.packages, data);
    if (!pkg) throw notFound();
    const sellability = await getSellabilityState([pkg]);
    // Display fields only: the full record carries our cost basis (lib/package-view.ts).
    return {
      pkg: toViewPackage(pkg, !sellability.hidden.has(pkg.packageCode)),
      djiwaPayEnabled:
        Buffer.byteLength(process.env["DJIWA_TRAVEL_WALLET_PAYMENT_SECRET"]?.trim() ?? "", "utf8") >= 32,
    };
  });

export const Route = createFileRoute("/checkout/$id")({
  loader: ({ params }) => loadCheckout({ data: params.id }),
  head: () => ({
    meta: [
      { title: "Checkout — Djiwa Travel" },
      { name: "description", content: "Bayar eSIM lewat QRIS atau saldo Djiwa Pay." },
      { property: "og:title", content: "Checkout — Djiwa Travel" },
      { property: "og:description", content: "Bayar eSIM lewat QRIS atau saldo Djiwa Pay." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Checkout,
});

const methods = [
  { id: "qris", label: "QRIS", desc: "Pilihan kanal pembayaran tersedia di halaman Mayar.", icon: QrCode },
  { id: "djiwa_pay", label: "Bayar langsung pakai saldo Djiwa Pay", desc: "Recommended · Potong saldo Djiwa Pay kamu langsung.", icon: WalletCards },
] as const;

function Checkout() {
  const { pkg, djiwaPayEnabled } = Route.useLoaderData();
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
  const canPay =
    valid &&
    (!user || memberProfileReady) &&
    (method !== "djiwa_pay" || walletAvailability === "available");

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
  return (
    <Page>
      <BackBar title="Checkout" />
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
      {user && !memberProfileReady && (
        <div className="mb-3 rounded-2xl border border-brand-red/20 bg-brand-red-soft p-3 text-sm">
          <p className="font-semibold">Lengkapi profil untuk checkout sebagai member</p>
          <p className="mt-1 text-muted-foreground">Guest checkout tetap tersedia tanpa akun.</p>
          <Link
            to="/profile"
            search={{ admin: undefined, returnTo: undefined, calendar: undefined, calendarSync: undefined }}
            className="mt-2 inline-flex font-semibold text-brand-red"
          >
            Lengkapi data di Profil →
          </Link>
        </div>
      )}
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
          onBlur={() => setWa((value) => (isValidWhatsapp(value) ? formatWhatsapp(value) : value))}
        />
      </div>
      {wa.trim() !== "" && !isValidWhatsapp(wa) && (
        <p role="alert" className="mt-2 px-1 text-xs text-destructive">
          Nomor WhatsApp belum valid. Contoh: 08123456789.
        </p>
      )}
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        {user ? "Masuk sebagai member." : "Tanpa perlu daftar akun."} Boleh ketik 0812… — kami ubah
        otomatis ke format 62….
      </p>
      <DeviceCompatibility />

      <h2 className={`${label} mt-6`}>Pembayaran</h2>
      <div className={group}>
        {methods.map(({ id, label: name, desc, icon: I }) => (
          <button
            key={id}
            onClick={() => setMethod(id)}
            aria-pressed={method === id}
            className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <I className="size-6 shrink-0 text-primary" strokeWidth={1.6} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{name}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
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
      {method === "djiwa_pay" && walletAvailability !== "available" && (
        <div className="mt-3 rounded-2xl border border-brand-red/20 bg-brand-red-soft p-3 text-sm">
          {walletAvailability === "sign_in" ? (
            <>
              <p>Masuk sebagai member untuk membayar langsung dari saldo Djiwa Pay.</p>
              <Link
                to="/profile"
                search={{ admin: undefined, returnTo: undefined, calendar: undefined, calendarSync: undefined }}
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
                search={{ admin: undefined, returnTo: undefined, calendar: undefined, calendarSync: undefined }}
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

      <StickyCta aboveTabBar>
        {!pkg.sellable && (
          <p className="pb-2 text-center text-xs font-semibold text-destructive">
            Paket ini sedang tidak tersedia. Silakan pilih paket lain.
          </p>
        )}
        {!canPay && !submitting && pkg.sellable && (
          <p className="pb-2 text-center text-xs text-muted-foreground">
            {!valid
              ? "Isi email dan nomor WhatsApp yang valid untuk melanjutkan."
              : method === "djiwa_pay"
                ? walletAvailability === "sign_in"
                  ? "Masuk ke akun member untuk membayar dengan saldo Djiwa Pay."
                  : walletAvailability === "complete_profile"
                    ? "Lengkapi profil untuk membayar dengan saldo Djiwa Pay."
                    : "Pembayaran saldo Djiwa Pay belum aktif."
                : "Lengkapi data pengiriman di Profil untuk checkout sebagai member."}
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
      </StickyCta>
    </Page>
  );
}
