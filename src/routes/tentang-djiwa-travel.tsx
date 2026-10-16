import { createFileRoute } from "@tanstack/react-router";
import { publicTrustHead, TrustPage, TrustSection } from "@/components/public-trust";

const title = "Tentang Djiwa Travel";
const description =
  "Kenali Djiwa Travel dan cara layanan eSIM perjalanan disajikan untuk traveler Indonesia.";

export const Route = createFileRoute("/tentang-djiwa-travel")({
  head: () => publicTrustHead(title, description, "/tentang-djiwa-travel"),
  component: AboutPage,
});

function AboutPage() {
  return (
    <TrustPage title={title} eyebrow="Tentang kami">
      <p>
        Djiwa Travel adalah storefront digital untuk membantu traveler Indonesia mencari dan membeli
        paket eSIM perjalanan sesuai destinasi, kuota, dan masa aktif yang tersedia di katalog.
      </p>
      <TrustSection title="Apa yang tersedia">
        <p>
          Pengunjung dapat menjelajahi destinasi, membandingkan detail paket yang tampil, lalu
          melanjutkan ke alur checkout yang disediakan di situs.
        </p>
        <p>
          Informasi paket dan ketersediaan dapat berubah mengikuti katalog yang sedang tersedia.
          Periksa detail pada halaman paket sebelum melakukan pembelian.
        </p>
      </TrustSection>
      <TrustSection title="Cara kami membantu">
        <p>
          Halaman panduan membantu menjelaskan pemilihan dan pemasangan eSIM secara umum. Untuk
          pertanyaan yang berkaitan dengan pesanan tertentu, dukungan dapat dihubungi melalui
          WhatsApp.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
