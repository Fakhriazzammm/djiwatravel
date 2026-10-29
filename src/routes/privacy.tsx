import { createFileRoute, Link } from "@tanstack/react-router";
import { BackBar, Page } from "@/components/shell";

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
      <BackBar title="Kebijakan Privasi" />
      <article className="mt-4 overflow-hidden rounded-2xl bg-surface text-sm leading-6">
        <p className="m-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950">
          Kebijakan privasi final sedang disiapkan oleh pemilik layanan. Halaman ini menjelaskan
          batas aman sementara, bukan dokumen legal final.
        </p>
        <section className="border-t border-border px-4 py-4">
          <h2 className="font-bold">Data yang dipakai</h2>
          <p className="mt-1 text-muted-foreground">
            Data kontak, kode pesanan, dan status transaksi dipakai untuk memproses pesanan,
            mengirim bantuan, dan menampilkan status eSIM. Kami tidak meminta IMEI untuk pemeriksaan
            kompatibilitas.
          </p>
        </section>
        <section className="border-t border-border px-4 py-4">
          <h2 className="font-bold">Data sensitif</h2>
          <p className="mt-1 text-muted-foreground">
            Jangan kirim password, OTP, nomor kartu, CVC, atau rahasia QR melalui chat maupun
            formulir bantuan. Detail eSIM hanya ditampilkan setelah otorisasi pesanan.
          </p>
        </section>
        <section className="border-t border-border px-4 py-4">
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
