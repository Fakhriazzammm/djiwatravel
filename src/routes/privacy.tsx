import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Page } from "@/components/shell";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Kebijakan Privasi — Djiwa Travel" },
      { name: "description", content: "Informasi privasi dan data pelanggan Djiwa Travel." },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <Page tabs={false}>
      <header className="flex min-h-14 items-center gap-3">
        <Link
          to="/profile"
          search={{ admin: undefined }}
          aria-label="Kembali ke profil"
          className="tap inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-brand-red"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
        </Link>
        <h1 className="text-base font-bold">Kebijakan Privasi</h1>
      </header>
      <article className="mt-4 space-y-5 rounded-2xl bg-surface p-5 text-sm leading-6">
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
          Kebijakan privasi final sedang disiapkan oleh pemilik layanan. Halaman ini menjelaskan
          batas aman sementara, bukan dokumen legal final.
        </p>
        <section>
          <h2 className="font-bold">Data yang dipakai</h2>
          <p className="mt-1 text-muted-foreground">
            Data kontak, kode pesanan, dan status transaksi dipakai untuk memproses pesanan,
            mengirim bantuan, dan menampilkan status eSIM. Kami tidak meminta IMEI untuk pemeriksaan
            kompatibilitas.
          </p>
        </section>
        <section>
          <h2 className="font-bold">Data sensitif</h2>
          <p className="mt-1 text-muted-foreground">
            Jangan kirim password, OTP, nomor kartu, CVC, atau rahasia QR melalui chat maupun
            formulir bantuan. Detail eSIM hanya ditampilkan setelah otorisasi pesanan.
          </p>
        </section>
        <section>
          <h2 className="font-bold">Pertanyaan privasi</h2>
          <p className="mt-1 text-muted-foreground">
            Untuk pertanyaan atau permintaan bantuan, gunakan{" "}
            <Link className="font-semibold text-brand-red" to="/support">
              Bantuan
            </Link>
            .
          </p>
        </section>
      </article>
    </Page>
  );
}
