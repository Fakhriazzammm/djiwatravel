export type TravelGuide = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  publishedAt: string;
  updatedAt: string;
  readTime: string;
  paragraphs: readonly string[];
  steps: readonly { title: string; body: string }[];
  relatedDestinations: readonly { code: string; label: string }[];
};

/** Curated guides are intentionally versioned in source so every indexed page stays useful. */
export const travelGuides: readonly TravelGuide[] = [
  {
    slug: "cara-memilih-esim-untuk-liburan-ke-jepang",
    title: "Cara Memilih eSIM untuk Liburan ke Jepang",
    description:
      "Panduan praktis memilih kuota, masa aktif, dan waktu pemasangan eSIM sebelum terbang ke Jepang.",
    eyebrow: "PANDUAN JEPANG",
    heading: "Pilih eSIM Jepang tanpa menebak kebutuhan internet",
    publishedAt: "2026-10-15",
    updatedAt: "2026-10-15",
    readTime: "4 menit baca",
    paragraphs: [
      "eSIM Jepang paling nyaman dipilih berdasarkan pola perjalanan, bukan hanya jumlah gigabita. Turis yang sering memakai peta, menerjemahkan menu, dan mengunggah foto membutuhkan kuota berbeda dari traveler yang sebagian besar memakai Wi-Fi hotel.",
      "Periksa juga masa aktif dan aturan aktivasi. Pilih paket yang masa berlakunya cukup untuk seluruh perjalanan, lalu pasang profil eSIM sebelum berangkat agar koneksi bisa langsung dipakai saat tiba.",
    ],
    steps: [
      {
        title: "Hitung pemakaian harian",
        body: "Siapkan kuota lebih besar bila rute mencakup banyak perjalanan kereta, navigasi real-time, atau hotspot untuk perangkat lain.",
      },
      {
        title: "Sesuaikan dengan lama liburan",
        body: "Paket 7 hari cocok untuk perjalanan singkat; perjalanan lebih panjang lebih praktis dengan masa aktif 15 atau 30 hari.",
      },
      {
        title: "Pasang sebelum berangkat",
        body: "Unduh profil saat masih memakai Wi-Fi. Aktifkan data seluler eSIM ketika pesawat mendarat dan matikan roaming SIM utama.",
      },
    ],
    relatedDestinations: [
      { code: "jp", label: "Lihat paket eSIM Jepang" },
      { code: "asia", label: "Bandingkan paket Asia" },
    ],
  },
  {
    slug: "internet-saat-umrah-dan-perjalanan-ke-arab-saudi",
    title: "Internet Saat Umrah dan Perjalanan ke Arab Saudi",
    description:
      "Checklist koneksi internet untuk umrah: navigasi, komunikasi rombongan, dan pengaturan eSIM yang aman.",
    eyebrow: "PANDUAN UMRAH",
    heading: "Tetap terhubung saat umrah tanpa bergantung pada Wi-Fi hotel",
    publishedAt: "2026-10-15",
    updatedAt: "2026-10-15",
    readTime: "5 menit baca",
    paragraphs: [
      "Saat umrah, koneksi internet membantu membuka peta, menghubungi ketua rombongan, memesan transportasi, dan menerjemahkan informasi perjalanan. Koneksi yang siap sejak keluar bandara membuat perpindahan dari Jeddah ke Makkah atau Madinah lebih tenang.",
      "Sebelum berangkat, pastikan ponsel mendukung eSIM dan tidak terkunci operator. Simpan nomor penting secara offline, serta gunakan jaringan hotel untuk mengunduh peta dan dokumen berukuran besar.",
    ],
    steps: [
      {
        title: "Siapkan kontak rombongan",
        body: "Simpan nomor pembimbing, hotel, dan anggota keluarga sebelum terbang supaya tetap bisa dihubungi ketika sinyal baru aktif.",
      },
      {
        title: "Atur dua SIM dengan benar",
        body: "Jadikan eSIM sebagai jalur data dan nonaktifkan data roaming pada SIM Indonesia untuk menghindari biaya tak terduga.",
      },
      {
        title: "Gunakan kuota secara hemat",
        body: "Unduh peta area Masjidil Haram dan Masjid Nabawi melalui Wi-Fi, lalu gunakan data seluler untuk navigasi dan pesan penting.",
      },
    ],
    relatedDestinations: [
      { code: "sa", label: "Lihat paket eSIM Arab Saudi" },
      { code: "asia", label: "Lihat paket regional" },
    ],
  },
  {
    slug: "tips-internet-traveling-ke-singapura-dan-malaysia",
    title: "Tips Internet Traveling ke Singapura dan Malaysia",
    description:
      "Cara menyiapkan internet untuk liburan singkat lintas Singapura dan Malaysia dengan satu ponsel.",
    eyebrow: "PANDUAN ASIA",
    heading: "Satu persiapan internet untuk Singapura dan Malaysia",
    publishedAt: "2026-10-15",
    updatedAt: "2026-10-15",
    readTime: "4 menit baca",
    paragraphs: [
      "Perjalanan singkat ke Singapura dan Malaysia sering memiliki jadwal padat: transportasi publik, pembayaran digital, reservasi, dan komunikasi berlangsung lewat ponsel. Internet yang langsung aktif mengurangi waktu mencari Wi-Fi di bandara.",
      "Jika itinerary hanya berisi satu negara, paket negara biasanya paling sederhana. Untuk rute lintas negara atau transit, bandingkan cakupan paket regional agar tidak perlu berganti profil saat berpindah perbatasan.",
    ],
    steps: [
      {
        title: "Pilih cakupan sesuai rute",
        body: "Paket Singapura cocok untuk satu tujuan; paket regional membantu ketika perjalanan berlanjut ke Malaysia atau negara Asia lain.",
      },
      {
        title: "Cek perangkat sebelum berangkat",
        body: "Pastikan ponsel mendukung eSIM, memiliki ruang untuk profil baru, dan sudah diperbarui agar pemasangan berjalan lancar.",
      },
      {
        title: "Jaga baterai saat jalan",
        body: "Aktifkan mode hemat daya dan unduh tiket atau alamat hotel. Navigasi dan aplikasi transportasi tetap bisa dipakai saat diperlukan.",
      },
    ],
    relatedDestinations: [
      { code: "sg", label: "Lihat paket eSIM Singapura" },
      { code: "my", label: "Lihat paket eSIM Malaysia" },
    ],
  },
];

export function getTravelGuide(slug: string): TravelGuide | undefined {
  return travelGuides.find((guide) => guide.slug === slug);
}

export const travelGuideSlugs = travelGuides.map(({ slug }) => slug);
