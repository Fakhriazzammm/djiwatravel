import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { QrCode, Landmark, Check } from "lucide-react";
import { useState } from "react";
import { Page, BackBar, StickyCta, btnRed, group, label } from "@/components/shell";
import { getResellerCatalog } from "@/lib/reseller-catalog-cache";
import { resolveCheckoutPackage } from "@/lib/checkout-package";
import { rupiah } from "@/lib/pricing";
import { createOrder } from "@/lib/orders";

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
      { name: "robots", content: "noindex" },
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
  const valid = /\S+@\S+\.\S+/.test(email) && wa.replace(/\D/g, "").length >= 9;

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
          <p className="font-semibold">{pkg.name}</p>
          <p className="text-sm text-muted-foreground">
            {pkg.locationCodes.join(", ") || "Regional"} · {pkg.durationDays} hari
          </p>
        </div>
        <p className="shrink-0 font-bold">{rupiah(price)}</p>
      </div>

      <h2 className={`${label} mt-6`}>Dikirim ke</h2>
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
          placeholder="Nomor WhatsApp"
          value={wa}
          onChange={(e) => setWa(e.target.value)}
        />
      </div>
      <p className="mt-2 px-1 text-xs text-muted-foreground">Tanpa perlu daftar akun.</p>

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

      <StickyCta>
        <button
          disabled={!valid || submitting}
          onClick={pay}
          className={`${btnRed} disabled:opacity-40`}
        >
          {submitting ? "Menyimpan pesanan…" : `Buat pesanan · ${rupiah(price)}`}
        </button>
      </StickyCta>
    </Page>
  );
}
