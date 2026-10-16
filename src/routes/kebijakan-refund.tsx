import { createFileRoute } from "@tanstack/react-router";
import { publicTrustHead, SUPPORT_URL, TrustPage, TrustSection } from "@/components/public-trust";

const title = "Kebijakan Refund";
const description =
  "Informasi umum tentang pertanyaan refund dan cara menghubungi dukungan Djiwa Travel.";

export const Route = createFileRoute("/kebijakan-refund")({
  head: () => publicTrustHead(title, description, "/kebijakan-refund"),
  component: RefundPage,
});

function RefundPage() {
  return (
    <TrustPage title={title} eyebrow="Informasi pembelian">
      <p>
        Halaman ini menjelaskan cara mengajukan pertanyaan terkait refund secara umum. Keputusan
        atas suatu pesanan perlu ditinjau berdasarkan detail transaksi, status layanan, dan keadaan
        yang disampaikan.
      </p>
      <TrustSection title="Mengajukan pertanyaan">
        <p>
          Hubungi dukungan melalui WhatsApp dan sertakan informasi pesanan yang relevan. Jangan
          kirim data pembayaran yang tidak diperlukan.
        </p>
        <p>
          Tim dukungan akan meninjau pertanyaan sesuai informasi yang tersedia dan dapat meminta
          detail tambahan yang berkaitan dengan pesanan.
        </p>
      </TrustSection>
      <TrustSection title="Hal yang perlu diperhatikan">
        <p>
          Refund tidak dapat dianggap otomatis hanya karena permintaan telah dikirim. Hasil
          peninjauan, cara pengembalian, dan langkah berikutnya akan disampaikan berdasarkan kasus
          yang ditanyakan.
        </p>
        <p>
          Untuk menghindari salah tafsir, periksa detail paket dan instruksi sebelum pembelian. Jika
          ada kondisi khusus, tanyakan terlebih dahulu.
        </p>
      </TrustSection>
      <p>
        <a
          className="font-semibold text-brand-red"
          href={SUPPORT_URL}
          target="_blank"
          rel="noreferrer"
        >
          Hubungi dukungan untuk pertanyaan pesanan
        </a>
        .
      </p>
    </TrustPage>
  );
}
