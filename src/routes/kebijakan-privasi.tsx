import { createFileRoute } from "@tanstack/react-router";
import { publicTrustHead, SUPPORT_URL, TrustPage, TrustSection } from "@/components/public-trust";

const title = "Kebijakan Privasi";
const description =
  "Informasi umum tentang data yang digunakan saat checkout dan profil Djiwa Travel.";

export const Route = createFileRoute("/kebijakan-privasi")({
  head: () => publicTrustHead(title, description, "/kebijakan-privasi"),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <TrustPage title={title} eyebrow="Privasi">
      <p>
        Halaman ini menjelaskan secara umum informasi yang terlihat digunakan dalam alur Djiwa
        Travel. Informasi ini perlu ditinjau kembali jika alur layanan berubah.
      </p>
      <TrustSection title="Informasi pada checkout dan profil">
        <p>
          Source aplikasi menunjukkan bahwa email dan WhatsApp dapat dikumpulkan pada checkout atau
          profil untuk kebutuhan order dan billing. Isi hanya informasi yang diperlukan dan pastikan
          kontak yang diberikan dapat diakses.
        </p>
      </TrustSection>
      <TrustSection title="Penggunaan informasi">
        <p>
          Informasi tersebut digunakan dalam konteks pengelolaan pesanan, billing, akun, dan
          komunikasi dukungan yang berkaitan dengan layanan. Jangan kirim data pembayaran atau data
          sensitif melalui kanal yang tidak diminta.
        </p>
        <p>
          Detail pengelolaan data, penyimpanan, atau permintaan terkait data dapat berubah mengikuti
          implementasi layanan. Hubungi dukungan untuk pertanyaan spesifik tentang pesanan atau
          informasi akun.
        </p>
      </TrustSection>
      <TrustSection title="Pertanyaan privasi">
        <p>
          <a
            className="font-semibold text-brand-red"
            href={SUPPORT_URL}
            target="_blank"
            rel="noreferrer"
          >
            Hubungi dukungan Djiwa Travel via WhatsApp
          </a>{" "}
          untuk menyampaikan pertanyaan terkait informasi yang digunakan dalam layanan.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
