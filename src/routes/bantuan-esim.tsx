import { createFileRoute } from "@tanstack/react-router";
import { publicTrustHead, SUPPORT_URL, TrustPage, TrustSection } from "@/components/public-trust";

const title = "Bantuan eSIM";
const description =
  "Panduan umum memilih, memasang, dan menggunakan eSIM Djiwa Travel saat bepergian.";

export const Route = createFileRoute("/bantuan-esim")({
  head: () => publicTrustHead(title, description, "/bantuan-esim"),
  component: HelpPage,
});

function HelpPage() {
  return (
    <TrustPage title={title} eyebrow="Pusat bantuan">
      <p>
        Gunakan panduan ini sebagai langkah awal. Detail pemasangan dapat berbeda menurut perangkat,
        sistem operasi, dan paket yang dibeli.
      </p>
      <TrustSection title="Sebelum berangkat">
        <p>
          Pastikan perangkat mendukung eSIM, tidak terkunci pada operator tertentu, dan memiliki
          koneksi internet saat proses pemasangan.
        </p>
        <p>Siapkan detail perjalanan dan cocokkan negara atau wilayah dengan paket yang dipilih.</p>
      </TrustSection>
      <TrustSection title="Pemasangan dan penggunaan">
        <p>
          Ikuti instruksi pemasangan yang tersedia setelah pembelian. Jangan menghapus profil eSIM
          sebelum masa penggunaan selesai jika masih diperlukan.
        </p>
        <p>
          Pengaturan data seluler, roaming, dan pemilihan line dapat berbeda di setiap perangkat.
          Periksa petunjuk ponsel sebelum mengubah pengaturan.
        </p>
      </TrustSection>
      <TrustSection title="Jika mengalami kendala">
        <p>
          Simpan informasi pesanan dan jelaskan perangkat serta kendala yang muncul agar pertanyaan
          dapat ditinjau dengan konteks yang cukup.
        </p>
        <p>
          <a
            className="font-semibold text-brand-red"
            href={SUPPORT_URL}
            target="_blank"
            rel="noreferrer"
          >
            Hubungi dukungan Djiwa Travel via WhatsApp
          </a>
          .
        </p>
      </TrustSection>
    </TrustPage>
  );
}
