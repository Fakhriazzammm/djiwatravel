import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, QrCode, Plus, Headphones } from "lucide-react";
import { Page, BackBar, group, row } from "@/components/shell";
import { EsimQr, InstallGuide, ManualDetails } from "@/components/esim-install";
import { rupiah } from "@/lib/pricing";
import { cancelOrder, hasGuestOrderAccess, markInstalled, useOrders } from "@/lib/orders";
import { SUPPORT_WHATSAPP_URL } from "@/lib/guest-order-access.server";
import { effectiveOrderStatus, ORDER_STATUS_LABEL } from "@/lib/esim-status";

/** Support channel; single place to swap in a real number. */

export const Route = createFileRoute("/my-esim/$id")({
  head: () => ({
    meta: [
      { title: "Detail eSIM — Djiwa Travel" },
      { name: "description", content: "Kuota, masa berlaku, dan cara pasang eSIM-mu." },
      { property: "og:title", content: "Detail eSIM — Djiwa Travel" },
      { property: "og:description", content: "Kuota, masa berlaku, dan cara pasang eSIM-mu." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Detail,
});

function Detail() {
  const { id } = Route.useParams();
  const orders = useOrders();
  const [tab, setTab] = useState<"none" | "install" | "topup">("none");
  const [tech, setTech] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const o = hasGuestOrderAccess(id) ? orders?.find((x) => x.id === id) : undefined;
  if (!orders)
    return (
      <Page>
        <div className="mt-20 h-40 animate-pulse rounded-2xl bg-secondary" />
      </Page>
    );
  if (!o)
    return (
      <Page>
        <BackBar />
        <p className="mt-10 text-center text-muted-foreground">eSIM tidak ditemukan.</p>
      </Page>
    );
  const status = effectiveOrderStatus(o.status, o.expiresAt);
  const canInstall = Boolean(o.esim) && (status === "READY" || status === "INSTALLED");
  const packageName = o.packageName ?? o.packageId;
  const locationLabel = o.locationCodes?.join(", ") || "Regional";
  const durationDays = o.durationDays ?? 0;
  const quotaLabel =
    o.volumeBytes == null ? "Unlimited" : `${(o.volumeBytes / 1_000_000_000).toFixed(1)} GB`;
  const total = o.volumeBytes == null ? null : o.volumeBytes / 1_000_000_000;
  const left = total === null ? null : total - (o.usedGb ?? 0);
  const exp = new Date(o.createdAt + durationDays * 864e5).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
  });

  return (
    <Page>
      <BackBar title={`🌐 ${packageName}`} />
      <div className="rounded-2xl bg-surface p-5">
        <p className="text-sm text-muted-foreground">Status eSIM</p>
        <p className="text-xl font-bold">{ORDER_STATUS_LABEL[status]}</p>
        <p className="mt-4 text-sm text-muted-foreground">Kuota tersisa</p>
        <p className="text-3xl font-bold">
          {canInstall ? (left !== null ? `${left.toFixed(1)} GB` : "Unlimited") : "Belum aktif"}
        </p>
        {total && left !== null && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(left / total) * 100}%` }}
            />
          </div>
        )}
        {canInstall && left !== null && left < 1 && (
          <p className="mt-2 text-sm text-brand-red">Kuotamu hampir habis.</p>
        )}
      </div>

      {status === "PROVISIONING_FAILED" && (
        <div className="mt-4 rounded-2xl border border-brand-red/20 bg-brand-red-soft p-4">
          <p className="font-semibold">Pemrosesan belum berhasil</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Kami dapat mencoba memproses pesanan ini kembali tanpa membuat order ganda.
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Provisioning otomatis belum diaktifkan.
          </p>
        </div>
      )}
      {actionMessage && (
        <p className="mt-3 text-center text-sm text-muted-foreground">{actionMessage}</p>
      )}

      <div className={`${group} mt-4`}>
        {[
          ["Paket", `${quotaLabel} · ${durationDays} hari`],
          ...(canInstall ? [["Berlaku sampai", `±${exp}`]] : []),
          ["Status", ORDER_STATUS_LABEL[status]],
          ["Destinasi", locationLabel],
        ].map(([k, v]) => (
          <div key={k} className={row}>
            <span className="text-[14px] text-muted-foreground">{k}</span>
            <span className="truncate text-[14px] font-medium">{v}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          {
            id: "install",
            l: "Instalasi",
            i: QrCode,
            on: () => setTab(tab === "install" ? "none" : "install"),
            off: !canInstall,
          },
          {
            id: "topup",
            l: "Top Up",
            i: Plus,
            on: () => setTab(tab === "topup" ? "none" : "topup"),
            off: true,
          },
          {
            id: "support",
            l: "Support",
            i: Headphones,
            on: () => window.open(SUPPORT_WHATSAPP_URL, "_blank"),
          },
        ].map(({ id, l, i: I, on, off }) => (
          <button
            key={id}
            disabled={off}
            onClick={on}
            className={`tap flex h-[72px] flex-col items-center justify-center gap-1 rounded-2xl text-[12px] font-semibold disabled:opacity-40 ${tab === id ? "bg-brand-red-soft text-brand-red" : "bg-surface"}`}
          >
            <I className="size-5" strokeWidth={1.8} />
            {l}
          </button>
        ))}
      </div>

      {tab === "install" && canInstall && o.esim && (
        <div className="mt-6 space-y-6">
          <EsimQr esim={o.esim} />
          <InstallGuide />
        </div>
      )}
      {tab === "topup" && (
        <div className="mt-6 rounded-2xl bg-surface p-4 text-sm text-muted-foreground">
          Top up belum tersedia; pembayaran dan provisioning masih dinonaktifkan.
        </div>
      )}

      <button
        onClick={() => setTech(!tech)}
        className="mt-6 flex h-11 w-full items-center justify-between rounded-2xl bg-surface px-4 text-[14px] text-muted-foreground"
      >
        Detail Teknis <ChevronDown className={`size-4 transition ${tech ? "rotate-180" : ""}`} />
      </button>
      {tech && o.esim && (
        <div className="mt-3">
          <ManualDetails esim={o.esim} iccid />
        </div>
      )}
      <Link to="/my-esim" className="sr-only">
        My eSIM
      </Link>
    </Page>
  );
}
