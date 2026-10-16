import { createFileRoute } from "@tanstack/react-router";
import { publicTrustHead, SUPPORT_URL, TrustPage, TrustSection } from "@/components/public-trust";

const title = "Syarat dan Ketentuan";
const description = "Ketentuan umum penggunaan situs dan pembelian paket eSIM Djiwa Travel.";

export const Route = createFileRoute("/syarat-ketentuan")({
  head: () => publicTrustHead(title, description, "/syarat-ketentuan"),
  component: TermsPage,
});

function TermsPage() {
  return (
    <TrustPage title={title} eyebrow="Ketentuan penggunaan">
      <p>
        Dengan menggunakan situs Djiwa Travel, pengunjung diharapkan membaca detail destinasi,
        kuota, masa aktif, harga, serta instruksi yang tampil sebelum melanjutkan pembelian.
      </p>
      <TrustSection title="Penggunaan situs">
        <p>
          Gunakan situs untuk kebutuhan yang sah dan berikan informasi checkout yang benar. Jangan
          mencoba mengganggu layanan, mengakses area yang bukan untuk publik, atau menggunakan
          informasi situs untuk menyesatkan pihak lain.
        </p>
      </TrustSection>
      <TrustSection title="Pesanan dan layanan">
        <p>
          Detail paket dan ketersediaan mengikuti informasi yang tampil pada katalog saat itu.
          Pembayaran, aktivasi, dan penggunaan eSIM mengikuti langkah serta informasi yang
          ditampilkan dalam alur transaksi.
        </p>
        <p>
          Jika terjadi pertanyaan atau ketidaksesuaian pada pesanan, hubungi dukungan dengan
          menyertakan informasi pesanan agar dapat ditinjau.
        </p>
      </TrustSection>
      <TrustSection title="Perubahan informasi">
        <p>
          Konten, katalog, dan ketentuan dapat diperbarui. Versi yang tampil di halaman ini menjadi
          informasi umum yang perlu dibaca kembali sebelum penggunaan atau pembelian.
        </p>
      </TrustSection>
      <p>
        <a
          className="font-semibold text-brand-red"
          href={SUPPORT_URL}
          target="_blank"
          rel="noreferrer"
        >
          Hubungi dukungan Djiwa Travel
        </a>{" "}
        jika ada bagian yang perlu dijelaskan.
      </p>
    </TrustPage>
  );
}
