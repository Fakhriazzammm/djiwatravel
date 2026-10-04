import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { QrCode, Landmark, Check } from "lucide-react";
import { useState } from "react";
import { Page, BackBar, StickyCta, btnRed, group } from "@/components/shell";
import { getDest, getPkg, priceOf, gbLabel } from "@/lib/catalog";
import { rupiah } from "@/lib/pricing";
import { createOrder } from "@/lib/orders";

export const Route = createFileRoute("/checkout/$id")({
  loader: ({ params }) => {
    const p = getPkg(params.id);
    const d = p && getDest(p.dest);
    if (!p || !d) throw notFound();
    return { p, d, price: priceOf(p) };
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
  const { p, d, price } = Route.useLoaderData();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [wa, setWa] = useState("");
  const [method, setMethod] = useState<"qris" | "va">("qris");
  const valid = /\S+@\S+\.\S+/.test(email) && wa.replace(/\D/g, "").length >= 9;

  const pay = () => {
    const o = createOrder({ packageId: p.id, amount: price, email, whatsapp: wa, method });
    nav({ to: "/order/$id", params: { id: o.id } });
  };

  const input = "w-full bg-transparent px-4 py-3.5 text-[17px] outline-none placeholder:text-muted-foreground";
  return (
    <Page tabs={false}>
      <BackBar />
      <h1 className="large-title">Checkout</h1>

      <div className="mt-6 flex items-center gap-4 rounded-2xl bg-surface p-4">
        <span className="text-4xl">{d.flag}</span>
        <div className="flex-1">
          <p className="font-semibold">{d.nameId} eSIM</p>
          <p className="text-sm text-muted-foreground">{gbLabel(p.dataGb)} · {p.days} hari</p>
        </div>
        <p className="font-bold">{rupiah(price)}</p>
      </div>

      <h2 className="mt-8 mb-2 px-1 text-sm font-medium text-muted-foreground">Dikirim ke</h2>
      <div className={group}>
        <input className={input} type="email" inputMode="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={input} type="tel" inputMode="tel" placeholder="Nomor WhatsApp" value={wa} onChange={(e) => setWa(e.target.value)} />
      </div>
      <p className="mt-2 px-1 text-xs text-muted-foreground">Tanpa perlu daftar akun.</p>

      <h2 className="mt-8 mb-2 px-1 text-sm font-medium text-muted-foreground">Pembayaran</h2>
      <div className={group}>
        {methods.map(({ id, label, desc, icon: I }) => (
          <button key={id} onClick={() => setMethod(id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
            <I className="size-6 text-primary" strokeWidth={1.6} />
            <div className="flex-1"><p className="font-medium">{label}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
            {method === id && <Check className="size-5 text-brand-red" />}
          </button>
        ))}
      </div>

      <StickyCta>
        <button disabled={!valid} onClick={pay} className={`${btnRed} disabled:opacity-40`}>Bayar {rupiah(price)}</button>
      </StickyCta>
    </Page>
  );
}
