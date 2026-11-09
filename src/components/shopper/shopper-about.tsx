import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Ban, ChevronDown, CircleHelp, Package, Shirt, Link2, ShoppingBag } from "lucide-react";
import type { ShopperConfig } from "@/lib/personal-shopper";

const CAN = [
  {
    icon: Shirt,
    title: "Pakaian",
    text: "Uniqlo dan GU: harga dan stok toko resmi Jepang.",
  },
  {
    icon: ShoppingBag,
    title: "Tas",
    text: "Legato Largo, anello, dan Longchamp langsung dari toko resminya.",
  },
  {
    icon: Link2,
    title: "Barang dari link",
    text: "Tempel link Mercari atau Rakuten, harga dibaca otomatis dari halamannya.",
  },
  {
    icon: Package,
    title: "Barang lain",
    text: "Kirim foto atau link toko lain, tim memeriksa lalu mengirim penawaran.",
  },
] as const;

const STEPS = [
  "Pilih barang dan bayar di aplikasi.",
  "Tim kami berbelanja langsung di Jepang dan memeriksa barangnya.",
  "Barang dikirim ke Indonesia, nomor resi tampil di pesanan.",
  "Barang sampai di alamatmu.",
] as const;

/** "Apa saja yang bisa dititip?" Collapsed by default so it never pushes the catalog down. */
export function ShopperAbout({ config }: { config: ShopperConfig }) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  return (
    <section className="mt-2 rounded-xl border border-border/70 bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="tap flex min-h-10 w-full items-center gap-2 px-3 text-left"
      >
        <CircleHelp className="size-4 shrink-0 text-brand-red" aria-hidden="true" />
        <span className="flex-1 text-[13px] font-semibold">Apa saja yang bisa dititip?</span>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-3 pb-3">
              <p className="text-[12px] text-muted-foreground">
                Titip Belanja untuk barang fisik dari Jepang. Tiket pesawat, eSIM, dan hotel untuk
                perjalananmu sendiri ada di layanan Djiwa yang lain. Biaya perjalanan tim kami ke
                Jepang sudah termasuk di jasa titip.
              </p>
              <ul className="grid gap-2">
                {CAN.map(({ icon: Icon, title, text }) => (
                  <li key={title} className="flex gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <Icon className="size-3.5" aria-hidden="true" />
                    </span>
                    <span className="text-[12px] leading-snug">
                      <b className="block text-[13px]">{title}</b>
                      <span className="text-muted-foreground">{text}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div>
                <p className="text-[12px] font-bold">Cara kerjanya</p>
                <ol className="mt-1 space-y-1">
                  {STEPS.map((step, i) => (
                    <li key={step} className="flex gap-2 text-[12px] text-muted-foreground">
                      <b className="flex size-4 shrink-0 items-center justify-center rounded-full bg-brand-red text-[9px] text-white">
                        {i + 1}
                      </b>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
              {config.prohibited.length > 0 && (
                <div className="rounded-lg bg-secondary px-2.5 py-2">
                  <p className="flex items-center gap-1 text-[12px] font-bold">
                    <Ban className="size-3.5 text-brand-red" aria-hidden="true" /> Tidak bisa
                    dititip
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-muted-foreground">
                    {config.prohibited.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Tap target on the cart's fee row: what the service fee and the other charges cover. */
export function FeeExplainer({ config, hasMarket }: { config: ShopperConfig; hasMarket: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="tap inline-flex items-center gap-1 text-[11px] font-semibold text-brand-red"
      >
        <CircleHelp className="size-3.5" aria-hidden="true" /> Biaya ini untuk apa?
      </button>
      {open && (
        <ul className="mt-1 space-y-1 rounded-lg bg-secondary px-2.5 py-2 text-[11px] text-muted-foreground">
          <li>
            <b className="text-foreground">Jasa titip {config.feePercent}%</b>: biaya tim kami
            berbelanja di Jepang, yaitu tiket pesawat, hotel, transportasi, dan operasional lainnya,
            ditambah memeriksa barang, mengurus pembayaran, dan menghubungimu bila ada yang berubah.
          </li>
          {hasMarket && (
            <li>
              <b className="text-foreground">Kirim dalam Jepang</b>: ongkos kirim dari penjual
              marketplace ke gudang kami, tidak dikenai jasa titip.
            </li>
          )}
          <li>
            <b className="text-foreground">Ongkir ke Indonesia</b>: satu biaya per pesanan, berapa
            pun jumlah barangnya.
          </li>
        </ul>
      )}
    </div>
  );
}
