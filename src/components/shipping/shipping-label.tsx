import { Download, FileText, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { CopyButton } from "@/components/shipping/shipping-ui";
import { usePrintAction } from "@/hooks/use-print-action";
import { buildLabelData, scanUrl, type DropPoint } from "@/lib/shipping";

type LabelOrder = Parameters<typeof buildLabelData>[0];

const small =
  "tap inline-flex min-h-8 items-center gap-1 rounded-lg bg-secondary px-2.5 text-[11px] font-semibold disabled:opacity-50";

/**
 * The parcel label as shown on the booking page: QR, big code and save buttons. The QR holds a link
 * whose only data is the shipment code; the team scans it at the drop point.
 */
export function ShippingLabelCard({
  order,
  dropPoint,
}: {
  order: LabelOrder;
  dropPoint: Pick<DropPoint, "name" | "address">;
}) {
  const { busy, run } = usePrintAction();
  const origin = typeof window === "undefined" ? "https://djiwatravel.com" : window.location.origin;
  const label = buildLabelData(order, dropPoint, origin);
  return (
    <div className="ios-card p-3 text-center">
      <p className="text-[11px] text-muted-foreground">Label paket</p>
      <div className="mx-auto mt-1 w-fit rounded-xl border border-border/70 bg-white p-2">
        <QRCodeSVG
          value={scanUrl(origin, order.code)}
          size={132}
          level="M"
          title={`QR ${order.code}`}
        />
      </div>
      <p className="mt-1 font-mono text-[22px] font-bold tracking-wide">{order.code}</p>
      <div className="mt-1.5 flex flex-wrap justify-center gap-1.5">
        <CopyButton value={order.code} label="Salin kode" />
        <button
          type="button"
          disabled={busy !== null}
          className={small}
          onClick={() =>
            run("png", async () => (await import("@/lib/shipping-print")).downloadLabelPng(label))
          }
        >
          <Download className="size-3.5" aria-hidden="true" />
          Simpan PNG
        </button>
        <button
          type="button"
          disabled={busy !== null}
          className={small}
          onClick={() =>
            run("pdf", async () =>
              (await import("@/lib/shipping-print")).downloadLabelsPdf([label]),
            )
          }
        >
          <FileText className="size-3.5" aria-hidden="true" />
          Unduh PDF
        </button>
        <button
          type="button"
          disabled={busy !== null}
          className={small}
          onClick={() =>
            run("share", async () => (await import("@/lib/shipping-print")).shareLabelPng(label))
          }
        >
          <Share2 className="size-3.5" aria-hidden="true" />
          Bagikan
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Cetak di kertas biasa, gunting, lalu tempel di sisi paket yang rata. Tanpa printer, tulis
        kode ini besar-besar di paket.
      </p>
    </div>
  );
}
