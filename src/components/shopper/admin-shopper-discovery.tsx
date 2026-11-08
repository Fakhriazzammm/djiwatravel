import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getAdminDiscovery,
  runAdminDiscoveryAction,
  saveAdminDiscoverySettings,
} from "@/lib/shopper-discovery.fn";
import {
  REQUEST_LABELS,
  offerTotal,
  type DiscoveryOffer,
  type DiscoveryRequest,
} from "@/lib/shopper-discovery";
import { formatIdr } from "@/lib/personal-shopper";
const field = "min-h-10 w-full rounded-xl border border-border bg-background px-3 text-sm";
const button =
  "min-h-10 rounded-xl border border-border px-3 text-xs font-semibold disabled:opacity-50";
const empty: DiscoveryOffer = {
  name: "",
  merchant: "",
  productUrl: "",
  condition: "",
  variant: "",
  quantity: 1,
  unitIdr: 0,
  unitJpy: 0,
  rateIdr: 0,
  domesticIdr: 0,
  feeIdr: 0,
  shippingIdr: 0,
  note: "",
};
export function AdminShopperDiscovery() {
  const [data, setData] = useState<Awaited<ReturnType<typeof getAdminDiscovery>> | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [offer, setOffer] = useState<DiscoveryOffer>(empty),
    [note, setNote] = useState(""),
    [hours, setHours] = useState(24),
    [verified, setVerified] = useState(false),
    [reason, setReason] = useState("");
  const row = data?.requests.find((r) => r.id === selected);
  async function refresh() {
    try {
      setData(await getAdminDiscovery());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Permintaan gagal dimuat.");
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  function pick(r: DiscoveryRequest) {
    setSelected(r.id);
    setOffer(
      r.offer
        ? {
            ...r.offer,
            rateIdr: data?.rateIdr ?? r.offer.rateIdr,
            unitIdr: Math.round(r.offer.unitJpy * (data?.rateIdr ?? r.offer.rateIdr)),
          }
        : { ...empty, productUrl: r.sourceUrl ?? "", rateIdr: data?.rateIdr ?? 0 },
    );
    setNote("");
    setVerified(false);
  }
  async function action(action: "search" | "ask" | "unavailable" | "offer") {
    if (!row) return;
    setBusy(true);
    setError("");
    try {
      await runAdminDiscoveryAction({
        data: {
          id: row.id,
          expectedVersion: row.version,
          action,
          note,
          expiresHours: hours,
          verifiedJapan: verified,
          ...(action === "offer" ? { offer } : {}),
        },
      });
      await refresh();
      toast.success("Permintaan diperbarui dan pelanggan diberi notifikasi.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tindakan gagal.");
    } finally {
      setBusy(false);
    }
  }
  async function settings() {
    if (!data) return;
    setBusy(true);
    try {
      await saveAdminDiscoverySettings({
        data: { config: data.config, expectedVersion: data.version, reason },
      });
      await refresh();
      setReason("");
      toast.success("Pengaturan pencarian disimpan.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pengaturan gagal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-xl bg-secondary p-3 text-sm text-brand-red">
          {error}
        </p>
      )}
      {!data ? (
        <button type="button" className={button} onClick={() => void refresh()}>
          Muat permintaan
        </button>
      ) : (
        <>
          <details className="rounded-2xl border border-border bg-surface p-3">
            <summary className="cursor-pointer text-sm font-semibold">
              Pengaturan pencarian link & foto
            </summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["enabled", "Aktifkan pencarian dan permintaan"],
                  ["photoEnabled", "Aktifkan analisis foto AI"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={data.config[key]}
                    onChange={(e) =>
                      setData({ ...data, config: { ...data.config, [key]: e.target.checked } })
                    }
                  />
                  {label}
                </label>
              ))}
              {(
                [
                  ["dailyLimit", "Pencarian / pelanggan / hari"],
                  ["photoDailyLimit", "Foto / pelanggan / hari"],
                  ["dailyAiRequests", "Foto AI maksimum / hari (semua pelanggan)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-xs">
                  {label}
                  <input
                    type="number"
                    className={`${field} mt-1`}
                    value={data.config[key]}
                    onChange={(e) =>
                      setData({
                        ...data,
                        config: { ...data.config, [key]: Number(e.target.value) },
                      })
                    }
                  />
                </label>
              ))}
              <label className="text-xs">
                Alasan perubahan
                <input
                  className={`${field} mt-1`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={300}
                />
              </label>
              <button
                type="button"
                disabled={busy || reason.trim().length < 3}
                className={button}
                onClick={() => void settings()}
              >
                Simpan pengaturan
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              AI{" "}
              {data.aiReady
                ? "terkonfigurasi"
                : "belum terkonfigurasi; foto tetap bisa diajukan manual"}
              . Foto draft dihapus setelah 7 hari; permintaan yang dikirim setelah 90 hari. Link
              selain adapter resmi tidak diambil oleh server.
            </p>
          </details>
          <div className="flex justify-between">
            <p className="text-sm font-semibold">Permintaan pencarian · {data.requests.length}</p>
            <button type="button" className={button} onClick={() => void refresh()}>
              Muat ulang
            </button>
          </div>
          {data.requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada permintaan pelanggan.</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
              <div className="space-y-2">
                {data.requests.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => pick(r)}
                    className={`w-full rounded-xl border p-3 text-left ${r.id === selected ? "border-brand-red bg-secondary" : "border-border"}`}
                  >
                    <span className="block truncate text-sm font-semibold">
                      {r.offer?.name || r.note || r.analysis || "Barang incaran"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {REQUEST_LABELS[r.status]} · v{r.version}
                    </span>
                  </button>
                ))}
              </div>
              {row && (
                <section className="space-y-3 rounded-2xl border border-border bg-surface p-3">
                  <p className="text-sm font-semibold">
                    {REQUEST_LABELS[row.status]} · v{row.version}
                  </p>
                  <p className="text-sm">{row.note}</p>
                  {row.analysis && (
                    <p className="text-xs text-muted-foreground">Analisis foto: {row.analysis}</p>
                  )}
                  {row.analysisError && (
                    <p className="text-xs text-muted-foreground">{row.analysisError}</p>
                  )}
                  {row.sourceUrl && (
                    <a
                      href={row.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block break-all text-xs text-brand-red"
                    >
                      {row.sourceUrl}
                    </a>
                  )}
                  {row.photoUrl && (
                    <img
                      src={row.photoUrl}
                      alt="Foto referensi pelanggan"
                      className="max-h-52 max-w-full rounded-xl object-contain"
                    />
                  )}
                  <ol className="space-y-2 text-xs">
                    {row.events.map((e, i) => (
                      <li key={i}>
                        <strong>{REQUEST_LABELS[e.status] || e.status}</strong> · {e.note}
                        {e.offer && (
                          <p>
                            Penawaran v{e.version}: {formatIdr(offerTotal(e.offer))}
                          </p>
                        )}
                        <span className="block text-muted-foreground">
                          {new Date(e.at).toLocaleString("id-ID")}
                        </span>
                      </li>
                    ))}
                  </ol>
                  {row.orderId ? (
                    <p className="text-sm">
                      Sudah menjadi pesanan. Kelola pembayaran, pembelian dan pengiriman di tab
                      Pesanan.
                    </p>
                  ) : (
                    !["CANCELLED", "DRAFT"].includes(row.status) && (
                      <>
                        <label className="block text-xs">
                          Pesan untuk pelanggan / alasan tindakan
                          <textarea
                            className={`${field} mt-1 py-2`}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            maxLength={1000}
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={button}
                            disabled={busy}
                            onClick={() => void action("search")}
                          >
                            Mulai cari
                          </button>
                          <button
                            type="button"
                            className={button}
                            disabled={busy}
                            onClick={() => void action("ask")}
                          >
                            Minta informasi
                          </button>
                          <button
                            type="button"
                            className={button}
                            disabled={busy}
                            onClick={() => void action("unavailable")}
                          >
                            Belum ditemukan
                          </button>
                        </div>
                        <details className="border-t border-border pt-3">
                          <summary className="cursor-pointer text-sm font-semibold">
                            Kirim / revisi penawaran
                          </summary>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {(
                              [
                                ["name", "Nama barang"],
                                ["merchant", "Toko / penjual"],
                                ["productUrl", "Link produk penjual"],
                                ["condition", "Kondisi barang"],
                                ["variant", "Ukuran dan warna"],
                                ["note", "Rincian tambahan"],
                              ] as const
                            ).map(([key, label]) => (
                              <label key={key} className="text-xs">
                                {label}
                                <input
                                  className={`${field} mt-1`}
                                  value={offer[key]}
                                  onChange={(e) => setOffer({ ...offer, [key]: e.target.value })}
                                />
                              </label>
                            ))}
                            {(
                              [
                                ["quantity", "Jumlah"],
                                ["unitJpy", "Harga toko satuan (JPY)"],
                                ["domesticIdr", "Ongkir domestik Jepang (IDR)"],
                                ["feeIdr", "Jasa titip (IDR)"],
                                ["shippingIdr", "Ongkir ke Indonesia (IDR)"],
                              ] as const
                            ).map(([key, label]) => (
                              <label key={key} className="text-xs">
                                {label}
                                <input
                                  type="number"
                                  min={key === "quantity" ? 1 : 0}
                                  className={`${field} mt-1`}
                                  value={offer[key]}
                                  onChange={(e) =>
                                    setOffer({
                                      ...offer,
                                      [key]: Number(e.target.value),
                                      ...(key === "unitJpy"
                                        ? {
                                            unitIdr: Math.round(
                                              Number(e.target.value) * offer.rateIdr,
                                            ),
                                          }
                                        : {}),
                                    })
                                  }
                                />
                              </label>
                            ))}
                            <label className="text-xs">
                              Berlaku (jam)
                              <input
                                type="number"
                                min={1}
                                max={168}
                                className={`${field} mt-1`}
                                value={hours}
                                onChange={(e) => setHours(Number(e.target.value))}
                              />
                            </label>
                          </div>
                          <p className="mt-3 text-sm font-semibold">
                            Total: {formatIdr(offerTotal(offer))} · ¥1 = {formatIdr(offer.rateIdr)}
                          </p>
                          <label className="mt-3 flex items-start gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={verified}
                              onChange={(e) => setVerified(e.target.checked)}
                            />
                            Saya sudah memeriksa penjual, kondisi, varian, stok, biaya dan
                            memastikan barang dapat dibeli di Jepang.
                          </label>
                          <button
                            type="button"
                            disabled={busy || !verified}
                            className={`${button} mt-3 bg-brand-red text-white`}
                            onClick={() => void action("offer")}
                          >
                            Kirim penawaran untuk disetujui
                          </button>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Revisi membuat versi baru. Pelanggan harus menyetujui rincian terbaru
                            sebelum pembayaran.
                          </p>
                        </details>
                      </>
                    )
                  )}
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
