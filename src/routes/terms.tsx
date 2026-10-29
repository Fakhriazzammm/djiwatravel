import { createFileRoute, Link } from "@tanstack/react-router";
import { BackBar, Page } from "@/components/shell";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Syarat & Ketentuan — Djiwa Travel" },
      { name: "description", content: "Informasi syarat dan ketentuan Djiwa Travel." },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <Page tabs={false}>
      <BackBar title="Syarat & Ketentuan" />
      <article className="mt-4 overflow-hidden rounded-2xl bg-surface text-sm leading-6">
        <p className="m-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
          Dokumen ketentuan final sedang disiapkan oleh pemilik layanan. Jangan gunakan halaman ini
          sebagai pengganti kontrak tertulis.
        </p>
        <section className="border-t border-border px-4 py-4">
          <h2 className="font-bold">Layanan</h2>
          <p className="mt-1 text-muted-foreground">
            Djiwa Travel membantu pembelian dan aktivasi eSIM perjalanan. Detail paket, harga, masa
            aktif, cakupan, dan ketersediaan mengikuti katalog/provider yang tampil saat checkout.
          </p>
        </section>
        <section className="border-t border-border px-4 py-4">
          <h2 className="font-bold">Pesanan dan pembayaran</h2>
          <p className="mt-1 text-muted-foreground">
            Redirect ke penyedia pembayaran bukan bukti settlement. Status pesanan mengikuti
            konfirmasi server dan provider.
          </p>
        </section>
        <section className="border-t border-border px-4 py-4">
          <h2 className="font-bold">Bantuan</h2>
          <p className="mt-1 text-muted-foreground">
            Jika ada masalah, buka{" "}
            <Link className="font-semibold text-brand-red" to="/support">
              Bantuan
            </Link>{" "}
            dan sertakan kode pesanan tanpa membagikan rahasia QR atau kredensial.
          </p>
        </section>
      </article>
    </Page>
  );
}
