import { ShopperNav } from "@/components/shopper/shopper-nav";
import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { BackBar, Page, btnPrimary } from "@/components/shell";
import { ProductImage } from "@/components/shopper/shopper-ui";
import {
  getMyShoppingOrder,
  payShoppingOrder,
  verifyShoppingPayment,
} from "@/lib/personal-shopper.fn";
import { ORDER_STATUS_LABEL, ORDER_STEPS, formatIdr } from "@/lib/personal-shopper";

export const Route = createFileRoute("/titip-belanja/pesanan/$id")({
  head: () => ({
    meta: [
      { title: "Pesanan Titip Belanja — Djiwa Travel" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  loader: ({ params }) => getMyShoppingOrder({ data: { orderId: params.id } }),
  errorComponent: () => (
    <Page tabs={false}>
      <ShopperNav active="orders" />
      <BackBar title="Pesanan" fallbackTo="/titip-belanja/pesanan" />
      <p className="mt-10 text-center text-[13px] text-muted-foreground">
        Pesanan tidak ditemukan atau kamu belum masuk.
      </p>
    </Page>
  ),
  component: ShopperOrder,
});

type Line = {
  name: string;
  size: string;
  color: string | null;
  quantity: number;
  unit_idr: number;
  unit_minor: number;
  image_url: string | null;
  product_url: string;
  variant: string | null;
  market_item_id: string | null;
};

function ShopperOrder() {
  const order = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const pending = order.status === "PAYMENT_PENDING";

  // Coming back from Mayar: confirm the payment with the provider, then show the result.
  useEffect(() => {
    if (!pending) return;
    let live = true;
    const check = () =>
      verifyShoppingPayment({ data: { orderId: order.id } })
        .then((r) => {
          if (live && r.status !== "PAYMENT_PENDING") void router.invalidate();
        })
        .catch(() => undefined);
    void check();
    const id = setInterval(check, 8000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [pending, order.id, router]);

  async function pay() {
    setBusy(true);
    try {
      const { paymentUrl } = await payShoppingOrder({ data: { orderId: order.id } });
      window.location.href = paymentUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pembayaran belum bisa dibuat.");
      setBusy(false);
    }
  }

  const reached = new Map(order.events.map((e) => [e.status, e.at]));
  const items = order.items as Line[];
  const dead = order.status === "CANCELLED" || order.status === "EXPIRED";
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Page tabs={false}>
      <ShopperNav active="orders" />
      <BackBar title={order.code} fallbackTo="/titip-belanja/pesanan" />
      <div className="ios-card p-3">
        <p className="text-[11px] text-muted-foreground">Status</p>
        <p className="text-[16px] font-bold">{ORDER_STATUS_LABEL[order.status]}</p>
        {pending && (
          <>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Selesaikan pembayaran sebelum {fmt(order.paymentExpiresAt)}.
            </p>
            <button
              type="button"
              onClick={pay}
              disabled={busy}
              className={`${btnPrimary} mt-2 w-full disabled:opacity-60`}
            >
              {busy ? "Membuka pembayaran…" : `Bayar ${formatIdr(order.totalIdr)}`}
            </button>
          </>
        )}
        {order.status === "CANCELLED" && (
          <p className="mt-1 text-[12px] text-muted-foreground">
            Bila sudah membayar, refund diproses tim kami.
          </p>
        )}
        {order.status === "EXPIRED" && (
          <Link to="/titip-belanja" className={`${btnPrimary} mt-2 w-full`}>
            Belanja lagi
          </Link>
        )}
      </div>

      {!dead && !pending && (
        <ol className="ios-group mt-3 p-3">
          {ORDER_STEPS.map((step, index) => {
            const at = reached.get(step);
            return (
              <li key={step} className="flex items-start gap-2.5 py-1.5">
                <span
                  className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-white ${at ? "bg-brand-red" : "bg-border"}`}
                >
                  {at ? (
                    <Check className="size-3" aria-hidden="true" />
                  ) : (
                    <span className="text-[9px]">{index + 1}</span>
                  )}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-[13px] ${at ? "font-semibold" : "text-muted-foreground"}`}
                  >
                    {ORDER_STATUS_LABEL[step]}
                  </span>
                  {at && <span className="block text-[10px] text-muted-foreground">{fmt(at)}</span>}
                  {step === "SHIPPED" && order.trackingNumber && (
                    <span className="block text-[11px]">
                      {order.courier ? `${order.courier} · ` : ""}Resi {order.trackingNumber}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <p className="ios-section-label mt-4">Barang</p>
      <ul className="ios-group divide-y divide-border/70">
        {items.map((l, i) => (
          <li key={i} className="ios-row">
            <ProductImage src={l.image_url} alt={l.name} className="size-11 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 block text-[13px] font-semibold">{l.name}</span>
              <span className="block text-[11px] text-muted-foreground">
                {l.market_item_id ? (l.variant ?? "") : l.size}
                {l.color ? ` · ${l.color}` : ""} · {l.quantity} ×{" "}
                {order.currency === "JPY" ? "¥" : `${order.currency} `}
                {l.unit_minor.toLocaleString("id-ID")} = {formatIdr(l.unit_idr * l.quantity)}
              </span>
            </span>
            <a
              href={l.product_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-brand-red"
            >
              Toko
            </a>
          </li>
        ))}
      </ul>

      <dl className="ios-group mt-3 space-y-1 p-3 text-[12px]">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Harga toko</dt>
          <dd>
            {order.currency === "JPY" ? "¥" : `${order.currency} `}
            {items.reduce((n, l) => n + l.unit_minor * l.quantity, 0).toLocaleString("id-ID")}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Kurs yang dikunci</dt>
          <dd>
            {order.currency === "JPY" ? "¥" : `${order.currency} `}1 = Rp{" "}
            {order.rate.toLocaleString("id-ID")}
          </dd>
        </div>
        <Money label="Barang dalam Rupiah" value={order.subtotalIdr} />
        {order.domesticIdr > 0 && (
          <Money label="Ongkir domestik Jepang" value={order.domesticIdr} />
        )}
        <Money label="Jasa titip" value={order.feeIdr} />
        <Money label="Ongkir" value={order.shippingIdr} />
        <div className="flex justify-between pt-1 text-[14px] font-bold">
          <dt>Total</dt>
          <dd>{formatIdr(order.totalIdr)}</dd>
        </div>
        <p className="pt-1 text-[10px] text-muted-foreground">
          Kurs {order.currency} 1 = Rp {order.rate.toLocaleString("id-ID")}
        </p>
      </dl>

      <p className="ios-section-label mt-4">Dikirim ke</p>
      <div className="ios-group p-3 text-[12px]">
        <p className="font-semibold">{order.recipientName}</p>
        <p className="text-muted-foreground">
          {order.addressLine}, {order.city} {order.postalCode}
        </p>
        <p className="text-muted-foreground">WhatsApp {order.whatsapp}</p>
        {order.note && <p className="mt-1">Catatan: {order.note}</p>}
      </div>
    </Page>
  );
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{formatIdr(value)}</dd>
    </div>
  );
}
