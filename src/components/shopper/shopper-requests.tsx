import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  getMyDiscoveryRequests,
  runCustomerDiscoveryAction,
  acceptDiscoveryQuote,
} from "@/lib/shopper-discovery.fn";
import { REQUEST_LABELS, offerTotal, type DiscoveryRequest } from "@/lib/shopper-discovery";
import { formatIdr, type ShopperAddress } from "@/lib/personal-shopper";
import { ShopperSheet } from "./shopper-ui";
const field = "min-h-10 w-full rounded-xl border border-border bg-secondary px-3 text-[13px]";
const empty: ShopperAddress = {
  recipientName: "",
  whatsapp: "62",
  addressLine: "",
  city: "",
  postalCode: "",
};
export function ShopperRequests() {
  const [rows, setRows] = useState<DiscoveryRequest[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [note, setNote] = useState(""),
    [address, setAddress] = useState(empty),
    [accepted, setAccepted] = useState(false),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const row = rows.find((r) => r.id === selected);
  async function refresh() {
    setError("");
    try {
      setRows(await getMyDiscoveryRequests());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Permintaan belum dapat dimuat.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function action(action: "reply" | "decline" | "cancel" | "refresh_offer") {
    if (!row) return;
    setBusy(true);
    try {
      await runCustomerDiscoveryAction({
        data: { id: row.id, expectedVersion: row.version, action, note },
      });
      await refresh();
      setNote("");
      toast.success("Permintaan diperbarui.");
    } catch (e) {
      await refresh();
      setError(e instanceof Error ? e.message : "Gagal memperbarui.");
    } finally {
      setBusy(false);
    }
  }
  async function pay() {
    if (!row || !accepted) return;
    setBusy(true);
    try {
      const result = await acceptDiscoveryQuote({
        data: { id: row.id, expectedVersion: row.version, address },
      });
      if (result.paymentUrl) {
        window.location.href = result.paymentUrl;
        return;
      }
      if (result.error) toast.info(result.error);
      await navigate({ to: "/titip-belanja/pesanan/$id", params: { id: result.orderId } });
    } catch (e) {
      await refresh();
      setError(e instanceof Error ? e.message : "Belum bisa melanjutkan pembayaran.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">Permintaan pencarian</h2>
        <button
          type="button"
          className="tap text-[12px] text-brand-red"
          onClick={() => void refresh()}
        >
          Muat ulang
        </button>
      </div>
      {loading ? (
        <p className="text-[12px] text-muted-foreground">Memuat permintaan…</p>
      ) : error ? (
        <p role="alert" className="text-[12px] text-brand-red">
          {error}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Permintaan dari link atau foto muncul di sini.
        </p>
      ) : (
        <div className="ios-group divide-y divide-border/70">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              className="tap flex min-h-12 w-full items-center gap-2 px-3 py-2 text-left"
              onClick={() => {
                setSelected(r.id);
                setAccepted(false);
                setError("");
              }}
            >
              {r.photoUrl && (
                <img
                  src={r.photoUrl}
                  alt="Referensi barang"
                  className="size-10 rounded-lg object-cover"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">
                  {r.offer?.name || r.analysis || r.note || "Barang incaran dari Jepang"}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {REQUEST_LABELS[r.status]} · {new Date(r.createdAt).toLocaleDateString("id-ID")}
                </span>
              </span>
              {r.offer && (
                <span className="text-[12px] font-semibold">{formatIdr(offerTotal(r.offer))}</span>
              )}
            </button>
          ))}
        </div>
      )}
      <ShopperSheet
        open={!!row}
        onOpenChange={(v) => {
          if (!v && !busy) setSelected(null);
        }}
        title="Permintaan pencarian"
        description={row ? (REQUEST_LABELS[row.status] ?? row.status) : ""}
      >
        {row && (
          <div className="space-y-3 py-3">
            {row.photoUrl && (
              <img
                src={row.photoUrl}
                alt="Foto referensi"
                className="mx-auto max-h-36 rounded-xl object-contain"
              />
            )}
            {row.sourceUrl && (
              <a
                href={row.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-[12px] text-brand-red"
              >
                Buka link referensi toko
              </a>
            )}
            <p className="text-[12px]">{row.note}</p>
            {row.offer && (
              <div className="rounded-2xl bg-secondary p-3 text-[12px]">
                <p className="text-[14px] font-semibold">{row.offer.name}</p>
                <p>
                  {row.offer.merchant} · {row.offer.variant} · {row.offer.quantity} barang
                </p>
                <p className="mt-1">Kondisi: {row.offer.condition}</p>
                <p className="mt-1 text-[11px]">
                  Harga toko ¥{row.offer.unitJpy.toLocaleString("id-ID")} / barang · ¥1 ={" "}
                  {formatIdr(row.offer.rateIdr)}
                </p>
                <a
                  className="text-brand-red"
                  href={row.offer.productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Lihat produk yang ditawarkan
                </a>
                <dl className="mt-2 space-y-1">
                  {[
                    ["Barang", row.offer.unitIdr * row.offer.quantity],
                    ["Ongkir domestik Jepang", row.offer.domesticIdr],
                    ["Jasa titip", row.offer.feeIdr],
                    ["Ongkir ke Indonesia", row.offer.shippingIdr],
                    ["Total", offerTotal(row.offer)],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between">
                      <dt>{label}</dt>
                      <dd className="font-semibold">{formatIdr(Number(value))}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2">{row.offer.note}</p>
                <p className="mt-1 text-[11px]">
                  Penawaran v{row.version} · berlaku sampai{" "}
                  {row.offerExpiresAt ? new Date(row.offerExpiresAt).toLocaleString("id-ID") : "—"}.
                  Stok dapat berubah sebelum pembelian.
                </p>
              </div>
            )}
            {row.status === "NEEDS_INFO" && (
              <>
                <label className="block text-[12px]">
                  Informasi tambahan
                  <textarea
                    className={`${field} mt-1 py-2`}
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  className="tap ios-btn w-full bg-brand-red text-white"
                  onClick={() => void action("reply")}
                >
                  Kirim informasi
                </button>
              </>
            )}
            {row.status === "OFFERED" &&
              row.offerExpiresAt &&
              new Date(row.offerExpiresAt) > new Date() && (
                <>
                  <p className="text-[13px] font-semibold">Alamat pengiriman</p>
                  {(
                    [
                      ["recipientName", "Nama penerima"],
                      ["whatsapp", "WhatsApp"],
                      ["addressLine", "Alamat lengkap"],
                      ["city", "Kota"],
                      ["postalCode", "Kode pos"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="block text-[12px]">
                      {label}
                      <input
                        className={`${field} mt-1`}
                        value={address[key]}
                        onChange={(e) => setAddress((a) => ({ ...a, [key]: e.target.value }))}
                      />
                    </label>
                  ))}
                  <label className="flex items-start gap-2 text-[12px]">
                    <input
                      type="checkbox"
                      checked={accepted}
                      onChange={(e) => setAccepted(e.target.checked)}
                    />
                    Saya menyetujui barang, kondisi, varian dan rincian harga penawaran ini.
                  </label>
                  <button
                    type="button"
                    disabled={!accepted || busy}
                    className="tap ios-btn w-full bg-brand-red text-white disabled:opacity-50"
                    onClick={() => void pay()}
                  >
                    {busy ? "Memproses…" : "Setujui & lanjut pembayaran"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className="tap ios-btn w-full bg-secondary"
                    onClick={() => void action("decline")}
                  >
                    Tolak penawaran
                  </button>
                </>
              )}
            {row.status === "OFFERED" &&
              row.offerExpiresAt &&
              new Date(row.offerExpiresAt) <= new Date() && (
                <p className="text-[12px] text-brand-red">
                  Penawaran kedaluwarsa. Tim perlu memperbarui penawaran sebelum kamu membayar.
                  <button
                    type="button"
                    disabled={busy}
                    className="tap ios-btn mt-2 w-full bg-secondary text-foreground"
                    onClick={() => void action("refresh_offer")}
                  >
                    Minta penawaran baru
                  </button>
                </p>
              )}
            {row.orderId && (
              <Link
                to="/titip-belanja/pesanan/$id"
                params={{ id: row.orderId }}
                className="tap ios-btn w-full bg-brand-red text-white"
              >
                Buka pesanan & pembayaran
              </Link>
            )}
            {row.events.length > 0 && (
              <ol className="space-y-2 border-t border-border pt-3">
                {row.events.map((e, i) => (
                  <li key={i} className="text-[12px]">
                    <strong>{REQUEST_LABELS[e.status] || e.status}</strong>
                    <p>{e.note}</p>
                    {e.offer && (
                      <p>
                        Penawaran v{e.version}: {formatIdr(offerTotal(e.offer))}
                      </p>
                    )}
                    <small className="text-muted-foreground">
                      {new Date(e.at).toLocaleString("id-ID")}
                    </small>
                  </li>
                ))}
              </ol>
            )}
            {error && (
              <p role="alert" className="text-[12px] text-brand-red">
                {error}
              </p>
            )}
            {["SUBMITTED", "SEARCHING", "NEEDS_INFO", "OFFERED", "DECLINED"].includes(
              row.status,
            ) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void action("cancel")}
                className="tap ios-btn w-full bg-secondary"
              >
                Batalkan permintaan
              </button>
            )}
          </div>
        )}
      </ShopperSheet>
    </section>
  );
}
