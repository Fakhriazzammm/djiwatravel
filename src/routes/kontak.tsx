import { createFileRoute } from "@tanstack/react-router";
import { publicTrustHead, SUPPORT_URL, TrustPage, TrustSection } from "@/components/public-trust";

const title = "Kontak Djiwa Travel";
const description = "Hubungi dukungan Djiwa Travel untuk pertanyaan eSIM dan pesanan.";

export const Route = createFileRoute("/kontak")({
  head: () => publicTrustHead(title, description, "/kontak"),
  component: ContactPage,
});

function ContactPage() {
  return (
    <TrustPage title={title} eyebrow="Dukungan">
      <p>
        Gunakan kanal berikut untuk pertanyaan tentang eSIM, katalog, pemasangan, atau pesanan Djiwa
        Travel.
      </p>
      <TrustSection title="WhatsApp">
        <p>
          Untuk bantuan yang berkaitan dengan pesanan, sertakan konteks yang relevan seperti nomor
          atau detail pesanan. Hindari mengirim data pembayaran yang tidak diperlukan.
        </p>
        <a
          className="inline-flex rounded-xl bg-brand-red px-4 py-3 font-semibold text-primary-foreground"
          href={SUPPORT_URL}
          target="_blank"
          rel="noreferrer"
        >
          Buka WhatsApp dukungan
        </a>
      </TrustSection>
      <TrustSection title="Sebelum menghubungi">
        <p>
          Periksa destinasi, detail paket, masa aktif, serta instruksi yang tampil pada halaman
          transaksi. Informasi yang lengkap membantu pertanyaan ditinjau dengan lebih tepat.
        </p>
        <p>
          Kanal dan informasi dukungan dapat diperbarui. Gunakan tautan WhatsApp yang tercantum di
          halaman ini untuk memulai percakapan.
        </p>
      </TrustSection>
    </TrustPage>
  );
}
