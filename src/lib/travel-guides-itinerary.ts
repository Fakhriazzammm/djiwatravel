import { officialTemplates, type OfficialTemplate } from "./official-templates";
import type { TravelGuide } from "./travel-guides";

/**
 * One itinerary guide per official Travo template (Japan already has its own guide, which links to
 * its template), plus a pillar page listing all templates. Day-by-day text is built from the same
 * data the template is published from, so the article and the copyable template cannot drift.
 */
const PUBLISHED = "2026-11-27";

const APPLE_TRAVEL = {
  label: "Apple: menggunakan eSIM saat bepergian internasional",
  url: "https://support.apple.com/en-us/118227",
};

/** Reused illustrations (no new image credits): each alt text describes the picture actually shown. */
const GENERIC = {
  file: "pilih-kuota-traveling",
  alt: "Ilustrasi traveler merencanakan rute perjalanan sambil memeriksa ponsel",
};
const IMAGES: Record<string, { file: string; alt: string }> = {
  KR: {
    file: "tmoney-seoul",
    alt: "Ilustrasi traveler menempelkan kartu transit ke pembaca di stasiun Seoul",
  },
  TH: {
    file: "bangkok-airport-rail-link",
    alt: "Ilustrasi kereta melintas di jalur layang di atas permukiman Bangkok",
  },
  SG: {
    file: "singapura-mrt",
    alt: "Ilustrasi traveler menempelkan kartu bank ke gerbang MRT Singapura",
  },
  MY: {
    file: "klia-ke-kuala-lumpur",
    alt: "Ilustrasi kereta ekspres di jalur layang Kuala Lumpur menjelang malam",
  },
  HK: {
    file: "hong-kong-airport-express",
    alt: "Ilustrasi traveler dengan koper di peron kereta Hong Kong",
  },
  TW: {
    file: "taoyuan-airport-mrt",
    alt: "Ilustrasi kereta melintas di jalur layang Taiwan saat matahari terbit",
  },
};

const place = (location: string) => location.split(",")[0]!.trim();

function dayText(index: number, items: OfficialTemplate["days"][number]): string {
  const list = items.map(([start, title, location]) => `${title} (${place(location)}, ${start})`);
  return `Hari ${index + 1}. ${list.join("; ")}.`;
}

function guideFor(t: OfficialTemplate): TravelGuide {
  const n = t.days.length;
  const image = IMAGES[t.code] ?? GENERIC;
  return {
    slug: t.slug.replace(/^travo-/, "itinerary-"),
    title: `Itinerary ${t.country} ${n} Hari: Rute per Hari dan Template Siap Pakai`,
    description: `Itinerary ${t.country} ${n} hari yang mudah diikuti: ${t.description} Salin ke Agenda Djiwa Travel dan atur tanggalmu.`,
    eyebrow: `ITINERARY ${t.country.toUpperCase()}`,
    heading: `Itinerary ${t.title.replace(/^[^:]+:\s*/, "")} ala Travo: ${n} hari, bisa langsung disalin`,
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "5 menit baca",
    image: `/assets/guides/${image.file}.jpg`,
    imageAlt: image.alt,
    keywords: [
      `itinerary ${t.country} ${n} hari`,
      `rute liburan ${t.country}`,
      `template itinerary ${t.country}`,
    ],
    summary: `${t.description} Setiap hari berisi tiga sampai empat kegiatan dengan jam saran. Template ini bisa disalin ke Agenda Djiwa Travel lalu disesuaikan dengan tanggal, penginapan, dan minatmu. Harga dan jam buka tidak dicantumkan karena berubah; periksa sumber resmi sebelum berangkat.`,
    paragraphs: [
      t.intro,
      ...t.days.map((items, i) => dayText(i, items)),
      `Template ini adalah kerangka, bukan aturan. Geser kegiatan, tukar urutan hari, atau hapus yang tidak cocok. Setelah disalin, tiap kegiatan menjadi item di Agenda perjalananmu sehingga rute, jam, dan lokasi ada di satu tempat. Jam yang tertera hanyalah saran; periksa jam buka dan tiket di sumber resmi karena dapat berubah.`,
      `Sebelum berangkat, siapkan koneksi internet. eSIM yang dipasang lewat Wi-Fi membuat peta, terjemahan, dan pemesanan transportasi tetap berjalan sejak mendarat; ikuti petunjuk paket tentang kapan masa aktif mulai dihitung.`,
    ],
    steps: [
      ...t.tips,
      {
        title: "Salin template ke Agenda",
        body: "Buka halaman template, tekan Pakai template ini, masuk akun Djiwa Travel, pilih tanggal berangkat dan jumlah orang. Kegiatan akan tersusun per tanggal di Agenda.",
      },
    ],
    faqs: [
      ...t.faqs,
      {
        question: `Bagaimana cara memakai template ${t.country} ${n} hari ini?`,
        answer:
          "Buka halaman template di Djiwa Travel, tekan Pakai template ini, masuk dengan akunmu, lalu pilih tanggal berangkat. Template disalin sebagai trip baru yang bebas kamu ubah; template aslinya tidak berubah.",
      },
    ],
    sources: [t.source, APPLE_TRAVEL],
    relatedDestinations: [{ code: t.code.toLowerCase(), label: `Lihat paket eSIM ${t.country}` }],
    relatedLinks: [
      { template: t.slug, label: `Pakai template ${t.country} ${n} hari` },
      {
        guide: "template-itinerary-liburan-luar-negeri-siap-salin",
        label: "Semua template itinerary Travo",
      },
    ],
  };
}

const countryGuides = officialTemplates.filter((t) => t.code !== "JP").map(guideFor);

const pillar: TravelGuide = {
  slug: "template-itinerary-liburan-luar-negeri-siap-salin",
  title: "Template Itinerary Liburan ke 12 Negara: Siap Salin ke Agenda",
  description:
    "Dua belas template itinerary dari Travo untuk Jepang, Korea Selatan, Thailand, Singapura, Malaysia, Hong Kong, Taiwan, Vietnam, Turki, UEA, Australia, dan Italia.",
  eyebrow: "TEMPLATE ITINERARY",
  heading: "Pilih negara, salin rutenya, lalu atur tanggal liburanmu",
  publishedAt: PUBLISHED,
  updatedAt: PUBLISHED,
  readTime: "4 menit baca",
  image: `/assets/guides/${GENERIC.file}.jpg`,
  imageAlt: GENERIC.alt,
  keywords: ["template itinerary", "contoh itinerary liburan luar negeri", "itinerary siap pakai"],
  summary:
    "Djiwa Travel menyediakan dua belas template itinerary dari Travo untuk tujuan populer: Jepang, Korea Selatan, Thailand, Singapura, Malaysia, Hong Kong, Taiwan, Vietnam, Turki, UEA, Australia, dan Italia. Pilih satu, tekan Pakai template ini, tentukan tanggal berangkat, dan rute tersusun di Agenda.",
  paragraphs: [
    "Menyusun itinerary dari nol sering memakan waktu lebih lama daripada liburannya sendiri. Template membantu karena kamu mulai dari kerangka yang sudah masuk akal, lalu mengubahnya sesuai gaya jalanmu. Semua template di bawah disusun Travo dengan tempat-tempat yang sudah dikenal, jam saran, dan pembagian hari yang tidak terlalu padat.",
    ...officialTemplates.map((t) => `${t.title}. ${t.description}`),
    "Template adalah salinan. Saat kamu memakainya, Djiwa Travel membuat trip baru di akunmu dengan kegiatan per tanggal. Perubahanmu tidak memengaruhi template asli atau pengguna lain. Catatan, biaya, pemesanan, dan dokumen tidak ikut disalin, jadi kamu mengisinya sendiri sesuai perjalananmu.",
    "Harga tiket, penginapan, dan jam buka tidak dicantumkan di template karena berubah menurut musim. Gunakan fitur anggaran di Agenda atau tanyakan Travo untuk perkiraan, lalu cek sumber resmi sebelum memesan.",
  ],
  steps: [
    {
      title: "Pilih template yang paling dekat dengan rencanamu",
      body: "Lihat lama liburan dan kota yang ingin dikunjungi, lalu pilih template dengan jumlah hari terdekat.",
    },
    {
      title: "Tekan Pakai template ini",
      body: "Masuk dengan akun Djiwa Travel, pilih tanggal berangkat dan jumlah orang. Kegiatan tersusun per tanggal.",
    },
    {
      title: "Sesuaikan dengan minatmu",
      body: "Hapus, tambah, atau geser kegiatan. Tambahkan penginapan, tiket, dan catatan di Agenda.",
    },
    {
      title: "Siapkan koneksi sebelum berangkat",
      body: "Pilih eSIM untuk negara tujuan, pasang lewat Wi-Fi, dan simpan peta offline.",
    },
  ],
  faqs: [
    {
      question: "Apakah template itinerary Djiwa Travel gratis?",
      answer:
        "Melihat template terbuka untuk umum. Menyalinnya ke Agenda membutuhkan akun Djiwa Travel.",
    },
    {
      question: "Apakah biaya ikut disalin?",
      answer:
        "Tidak. Template hanya menyalin kegiatan per hari. Biaya, catatan, pemesanan, dan dokumen tidak ikut.",
    },
    {
      question: "Bisakah saya mengubah template setelah disalin?",
      answer:
        "Bisa. Hasil salinan menjadi trip milikmu dan bebas diubah tanpa memengaruhi template asli.",
    },
  ],
  sources: [
    APPLE_TRAVEL,
    { label: "JNTO: informasi resmi wisata Jepang", url: "https://www.japan.travel/en/" },
  ],
  relatedDestinations: [
    { code: "jp", label: "Lihat paket eSIM Jepang" },
    { code: "asia", label: "Bandingkan paket Asia" },
  ],
  relatedLinks: [
    ...officialTemplates.map((t) => ({
      template: t.slug,
      label: `${t.country} ${t.days.length} hari`,
    })),
    { to: "/my-trips/new", label: "Buat trip sendiri" },
  ],
};

export const itineraryGuides: readonly TravelGuide[] = [pillar, ...countryGuides];
