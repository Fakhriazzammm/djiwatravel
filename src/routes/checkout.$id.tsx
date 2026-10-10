import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { QrCode, Landmark, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { Page, BackBar, StickyCta, btnRed, group, label } from "@/components/shell";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { resolveCheckoutPackage } from "@/lib/checkout-package";
import { rupiah } from "@/lib/pricing";
import { createOrder } from "@/lib/orders";
import { packageCoverageLabel, packageDataLabel, packageDestinationLabel } from "@/lib/package-copy";
import { getBetterAuthSession, type BetterAuthUser } from "@/lib/better-auth-client";
import { isCustomerProfileComplete } from "@/lib/customer-profile";
import { loadCustomerProfile } from "@/lib/customer-profile-client";

export const Route = createFileRoute("/checkout/$id")({
  loader: async ({ params }) => {
    const catalog = await getResellerCatalog();
    const pkg = resolveCheckoutPackage(catalog.packages, params.id);
    if (!pkg) throw notFound();
    return { pkg };
  },
  head: () => ({
    meta: [
      { title: "Checkout — Djiwa Travel" },
      { name: "description", content: "Bayar eSIM dengan QRIS atau Virtual Account." },
      { property: "og:title", content: "Checkout — Djiwa Travel" },
      { property: "og:description", content: "Bayar eSIM dengan QRIS atau Virtual Account." },
      { property: "robots", content: "noindex" },
    ],
  }),
  component: Checkout,
});

const methods = [
  { id: "qris", label: "QRIS", desc: "GoPay, OVO, DANA, ShopeePay, m-banking", icon: QrCode },
  { id: "va", label: "Virtual Account", desc: "BCA, Mandiri, BNI, BRI", icon: Landmark },
] as const;

function Checkout() {
  const { pkg } = Route.useLoaderData();
  const price = pkg.sellingPrice.sellingPriceIdr;
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [wa, setWa] = useState("");
  const [method, setMethod] = useState<"qris" | "va">("qris");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<BetterAuthUser | null>(null);
  const [memberProfileReady, setMemberProfileReady] = useState(false);
  useEffect(() => {
    void getBetterAuthSession().then((session) => {
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        void loadCustomerProfile().then((saved) => {
          if (saved) {
            setEmail(saved.email);
            setWa(saved.whatsapp);
          }
          setMemberProfileReady(Boolean(saved && isCustomerProfileComplete(saved)));
        }).catch(() => setMemberProfileReady(false));
      }
    }).catch(() => setUser(null));
  }, []);
  const valid = isCustomerProfileComplete({ email, whatsapp: wa });
  const canPay = valid && (!user || memberProfileReady);

  const pay = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const o = await createOrder({
        packageId: pkg.packageCode,
        amount: price,
        email,
        whatsapp: wa,
        method,
      });
      // Go straight to Mayar: leaving the customer on the order screen when a
      // payment link already exists is a dead end they asked us to remove.
      if (o.paymentUrl) {
        window.location.assign(o.paymentUrl);
        return;
      }
      nav({ to: "/order/$id", params: { id: o.id } });
    } catch {
      setError("Pesanan belum dapat disimpan. Coba kembali beberapa saat lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  const input =
    "w-full bg-transparent h-12 px-4 text-[16px] outline-none placeholder:text-muted-foreground";
  return (
    <Page tabs={false}>
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
        <span className="shrink-0 text-3xl">🌐</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Paket internet</p>
          <p className="font-semibold">{packageDestinationLabel(pkg)}</p>
          <p className="text-sm text-muted-foreground">
            {packageDataLabel(pkg)} · {pkg.durationDays} hari masa aktif
            </p>
          <p className="mt-1 text-xs text-muted-foreground">Cakupan: {packageCoverageLabel(pkg)}</p>
        </div>
        <p className="shrink-0 font-bold">{rupiah(price)}</p>
      </div>

      <h2 className={`${label} mt-6`}>Dikirim ke</h2>
      {user && !memberProfileReady && (
        <div className="mb-3 rounded-2xl border border-brand-red/20 bg-brand-red-soft p-3 text-sm">
          <p className="font-semibold">Lengkapi profil untuk checkout sebagai member</p>
          <p className="mt-1 text-muted-foreground">Guest checkout tetap tersedia tanpa akun.</p>
          <Link to="/profile" className="mt-2 inline-flex font-semibold text-brand-red">Lengkapi data di Profil →</Link>
        </div>
      )}
      <div className={group}>
        <input
          className={input}
          type="email"
          inputMode="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className={input}
          type="tel"
          inputMode="tel"
          placeholder="Nomor WhatsApp (62…)"
          value={wa}
          onChange={(e) => setWa(e.target.value)}
        />
      </div>
      <p className="mt-2 px-1 text-xs text-muted-foreground">
        {user
          ? "Masuk sebagai member. Nomor WhatsApp memakai format 62…"
          : "Tanpa perlu daftar akun. Nomor WhatsApp memakai format 62…"}
      </p>

      <h2 className={`${label} mt-6`}>Pembayaran</h2>
      <div className={group}>
        {methods.map(({ id, label: name, desc, icon: I }) => (
          <button
            key={id}
            onClick={() => setMethod(id)}
            className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left"
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

      <StickyCta aboveTabBar={false}>
        <button
          disabled={!canPay || submitting}
          onClick={pay}
          className={`${btnRed} disabled:opacity-40`}
        >
          {submitting ? "Mengalihkan ke Mayar…" : `Buat pesanan · ${rupiah(price)}`}
        </button>
      </StickyCta>
    </Page>
  );
}
