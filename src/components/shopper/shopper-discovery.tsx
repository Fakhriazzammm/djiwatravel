import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Camera, Link as LinkIcon, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { CustomerAuth } from "@/components/customer-auth";
import { compressReceiptPhoto } from "@/lib/receipt-image";
import { getDiscoveryStatus } from "@/lib/shopper-discovery.fn";
import { startMyChatThread } from "@/lib/shopper-chat.fn";
import {
  formatIdr,
  formatMinor,
  productTitle,
  toIdr,
  type ShopperProduct,
} from "@/lib/personal-shopper";
import type { DiscoverySearchResult } from "@/lib/shopper-discovery";
import type { MarketItemView } from "@/lib/shopper-market";
import { ProductImage, ShopperSheet } from "./shopper-ui";
const field = "min-h-10 w-full rounded-xl border border-border bg-secondary px-3 text-[13px]";
export function ShopperDiscovery({
  onProduct,
  onMarket,
  rate,
}: {
  onProduct: (p: ShopperProduct) => void;
  onMarket: (item: MarketItemView) => void;
  /** Rupiah per yen, to show the estimate next to the page price. */
  rate?: number;
}) {
  const [enabled, setEnabled] = useState(false),
    [open, setOpen] = useState<"link" | "photo" | null>(null),
    [url, setUrl] = useState(""),
    [photo, setPhoto] = useState<File | null>(null),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [signIn, setSignIn] = useState(false),
    [result, setResult] = useState<DiscoverySearchResult | null>(null),
    [help, setHelp] = useState(false),
    [preview, setPreview] = useState<string | null>(null);
  const key = useRef("");
  const navigate = useNavigate();
  useEffect(() => {
    getDiscoveryStatus()
      .then((c) => setEnabled(c.enabled))
      .catch(() => setEnabled(false));
  }, []);
  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const blob = URL.createObjectURL(photo);
    setPreview(blob);
    return () => URL.revokeObjectURL(blob);
  }, [photo]);
  const start = (mode: "link" | "photo") => {
    setOpen(mode);
    setHelp(false);
    setResult(null);
    setError("");
    setSignIn(false);
    key.current = crypto.randomUUID();
  };
  async function search() {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("clientKey", key.current || crypto.randomUUID());
      form.set("url", open === "link" ? url : "");
      form.set("note", note);
      if (open === "photo") {
        if (!photo) throw new Error("Pilih foto produk terlebih dahulu.");
        if (photo.size > 5 * 1024 * 1024) throw new Error("Foto maksimal 5 MB.");
        if (!["image/jpeg", "image/png", "image/webp"].includes(photo.type))
          throw new Error("Pilih JPG, PNG atau WebP.");
        form.set("photo", await compressReceiptPhoto(photo), "product.jpg");
      }
      const response = await fetch("/api/shopper-search", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = (await response.json()) as DiscoverySearchResult & { error?: string };
      if (response.status === 401) setSignIn(true);
      if (!response.ok) throw new Error(data.error || "Pencarian gagal. Coba lagi.");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pencarian belum berhasil.");
    } finally {
      setBusy(false);
    }
  }
  /** Hands the search to the team as a conversation and opens it. */
  async function submit() {
    if (!result) return;
    setBusy(true);
    try {
      const r = await startMyChatThread({
        data: { requestId: result.requestId, text: note, url: "", clientKey: crypto.randomUUID() },
      });
      setOpen(null);
      toast.success("Tim sudah diberi tahu.");
      await navigate({ to: "/titip-belanja/pesan/$id", params: { id: r.threadId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pesan belum terkirim.");
    } finally {
      setBusy(false);
    }
  }
  if (!enabled) return null;
  return (
    <>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => start("link")}
          className="tap flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-border/70 bg-surface text-[12px] font-semibold"
        >
          <LinkIcon className="size-4" />
          Tempel link
        </button>
        <button
          type="button"
          onClick={() => start("photo")}
          className="tap flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-border/70 bg-surface text-[12px] font-semibold"
        >
          <Camera className="size-4" />
          Cari dari foto
        </button>
      </div>
      <ShopperSheet
        open={open !== null}
        onOpenChange={(v) => {
          if (!busy && !v) setOpen(null);
        }}
        title={
          result ? "Hasil pencarian" : open === "photo" ? "Cari dari foto" : "Tempel link produk"
        }
        description="Barang incaran dari toko Jepang, termasuk Mercari dan toko lainnya."
      >
        {
          <div className="space-y-3 py-3">
            {!result && (
              <>
                {open === "link" ? (
                  <label className="block text-[12px]">
                    Link produk
                    <input
                      className={`${field} mt-1`}
                      type="url"
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        key.current = crypto.randomUUID();
                      }}
                      placeholder="https://jp.mercari.com/item/…"
                    />
                  </label>
                ) : (
                  <>
                    <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-secondary p-3 text-[12px]">
                      <Camera className="size-6" />
                      Pilih foto produk
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="w-full text-[11px]"
                        onChange={(e) => {
                          setPhoto(e.target.files?.[0] ?? null);
                          key.current = crypto.randomUUID();
                        }}
                      />
                    </label>
                    {preview && (
                      <img
                        src={preview}
                        alt="Foto produk yang dipilih"
                        className="mx-auto max-h-40 rounded-xl object-contain"
                      />
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      JPG, PNG, WebP · maksimal 5 MB. Foto diperkecil dan metadata lokasi dihapus
                      sebelum dikirim.
                    </p>
                  </>
                )}
                <label className="block text-[12px]">
                  Catatan (opsional)
                  <input
                    className={`${field} mt-1`}
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ukuran, warna, jumlah atau kondisi yang dicari"
                  />
                </label>
                {!signIn && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void search()}
                    className="tap ios-btn w-full bg-brand-red text-white disabled:opacity-50"
                  >
                    {busy ? (
                      <>
                        <LoaderCircle className="mr-2 size-4 animate-spin" />
                        {open === "link" ? "Membaca halaman… (sampai 20 detik)" : "Mencari barang…"}
                      </>
                    ) : (
                      "Cari barang"
                    )}
                  </button>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Link Uniqlo, GU, Mercari, dan Rakuten dihitung otomatis. Link toko lain diperiksa
                  tim. Foto menghasilkan kandidat; periksa produknya sebelum membeli.
                </p>
              </>
            )}
            {result && (
              <>
                <p className="text-[12px]">{result.message}</p>
                {result.analysis && (
                  <p className="text-[12px] text-muted-foreground">{result.analysis}</p>
                )}
                {result.market && (
                  <button
                    type="button"
                    onClick={() => {
                      onMarket(result.market!);
                      setOpen(null);
                    }}
                    className="tap flex w-full items-center gap-2 rounded-xl border border-brand-red/40 bg-brand-red-soft p-2 text-left"
                  >
                    <ProductImage
                      src={result.market.imageUrl}
                      alt={result.market.name}
                      className="size-14 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-[10px] text-muted-foreground">
                        {result.market.site === "mercari" ? "Mercari" : "Rakuten"}
                        {result.market.conditionText ? ` · ${result.market.conditionText}` : ""}
                      </span>
                      <span className="line-clamp-2 text-[13px] font-semibold">
                        {result.market.name}
                      </span>
                      <span className="block text-[12px]">
                        {result.market.sold
                          ? "Sudah terjual"
                          : `${formatMinor(result.market.priceJpy, "¥")}${
                              rate ? ` · ≈ ${formatIdr(toIdr(result.market.priceJpy, rate))}` : ""
                            }`}
                      </span>
                    </span>
                  </button>
                )}
                {result.market && !result.market.sold && (
                  <button
                    type="button"
                    onClick={() => {
                      onMarket(result.market!);
                      setOpen(null);
                    }}
                    className="tap ios-btn w-full bg-brand-red text-white"
                  >
                    Titip barang ini
                  </button>
                )}
                <div className="space-y-2">
                  {result.products.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        onProduct(p);
                        setOpen(null);
                      }}
                      className="tap flex w-full items-center gap-2 rounded-xl border border-border/70 p-2 text-left"
                    >
                      <ProductImage
                        src={p.imageUrl}
                        alt={productTitle(p)}
                        className="size-14 shrink-0"
                      />
                      <span>
                        <span className="block text-[10px] text-muted-foreground">
                          {result.exact ? "Kode produk cocok" : "Kandidat serupa"}
                        </span>
                        <span className="line-clamp-2 text-[13px] font-semibold">
                          {productTitle(p)}
                        </span>
                        <span className="block text-[12px]">
                          {formatMinor(p.price, "¥")} · harga toko
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                {result.market && !result.market.sold && !help ? (
                  <button
                    type="button"
                    onClick={() => setHelp(true)}
                    className="tap w-full text-center text-[12px] font-semibold text-muted-foreground"
                  >
                    Bukan barang ini? Tanya tim Djiwa
                  </button>
                ) : (
                  <>
                    <label className="block text-[12px]">
                      Pesan untuk tim
                      <input
                        className={`${field} mt-1`}
                        value={note}
                        maxLength={1000}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Contoh: ukuran M, abu-abu, 1 barang"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void submit()}
                      className="tap ios-btn w-full bg-brand-red text-white disabled:opacity-50"
                    >
                      {busy ? "Membuka percakapan…" : "Tanya tim Djiwa"}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    setHelp(false);
                    key.current = crypto.randomUUID();
                  }}
                  className="tap ios-btn w-full bg-secondary"
                >
                  Cari barang lain
                </button>
              </>
            )}
            {error && (
              <p role="alert" className="text-[12px] text-brand-red">
                {error}
              </p>
            )}
            {signIn && <CustomerAuth size="block" />}
          </div>
        }
      </ShopperSheet>
    </>
  );
}
