export type TravelGuide = {
  slug: string;
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  publishedAt: string;
  updatedAt: string;
  readTime: string;
  image?: string;
  imageAlt?: string;
  sources?: readonly { label: string; url: string }[];
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
    image: "/assets/guides/esim-jepang-kuota.jpg",
    imageAlt: "Traveler merencanakan penggunaan eSIM untuk perjalanan di Jepang",
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
    image: "/assets/guides/esim-umrah-arab-saudi.jpg",
    imageAlt: "Jemaah umrah memeriksa ponsel bersama rombongan di area Masjidil Haram",
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
    image: "/assets/guides/internet-singapura-malaysia.jpg",
    imageAlt: "Traveler melintasi Singapura dan Malaysia dengan kereta sambil memeriksa peta di ponsel",
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
  {
    slug: "cara-memasang-esim-sebelum-berangkat",
    title: "Cara Memasang eSIM Sebelum Berangkat Traveling",
    description:
      "Langkah persiapan eSIM sebelum perjalanan: cek perangkat, simpan koneksi Wi-Fi, dan ikuti aturan aktivasi paket.",
    eyebrow: "PANDUAN eSIM",
    heading: "Siapkan eSIM sebelum hari keberangkatan",
    publishedAt: "2026-10-30",
    updatedAt: "2026-10-30",
    readTime: "4 menit baca",
    image: "/assets/guides/pasang-esim-perjalanan.jpg",
    imageAlt: "Traveler memasang eSIM di ponsel saat menunggu keberangkatan di bandara",
    paragraphs: [
      "Pemasangan eSIM bergantung pada model perangkat, status kunci operator, dan petunjuk paket yang dibeli. Periksa kompatibilitas perangkat dan baca instruksi aktivasi pada detail paket sebelum memulai.",
      "Siapkan koneksi Wi-Fi yang stabil dan jangan menghapus profil eSIM setelah terpasang kecuali petunjuk resmi meminta demikian. Waktu mulai masa aktif dapat berbeda menurut paket, jadi ikuti informasi paket dan instruksi penyedia.",
    ],
    steps: [
      {
        title: "Pastikan perangkat siap",
        body: "Periksa dukungan eSIM untuk model dan negara asal perangkatmu, serta pastikan perangkat tidak terkunci operator.",
      },
      {
        title: "Baca petunjuk paket",
        body: "Periksa cara pemasangan, cakupan, dan kapan masa aktif dimulai. Simpan petunjuk agar mudah dibuka kembali.",
      },
      {
        title: "Pasang dengan Wi-Fi stabil",
        body: "Ikuti langkah pada perangkat dan instruksi penyedia. Beri label pada jalur eSIM agar mudah membedakannya dari SIM utama.",
      },
    ],
    relatedDestinations: [
      { code: "jp", label: "Paket eSIM Jepang" },
      { code: "sg", label: "Paket eSIM Singapura" },
    ],
  },
  {
    slug: "cara-memilih-kuota-internet-saat-traveling",
    title: "Cara Memilih Kuota Internet untuk Traveling",
    description:
      "Panduan memperkirakan kebutuhan data perjalanan dari lama trip, kebiasaan aplikasi, dan akses Wi-Fi.",
    eyebrow: "PANDUAN KUOTA",
    heading: "Pilih kuota sesuai kebiasaan selama perjalanan",
    publishedAt: "2026-10-30",
    updatedAt: "2026-10-30",
    readTime: "4 menit baca",
    image: "/assets/guides/pilih-kuota-traveling.jpg",
    imageAlt: "Traveler memperkirakan kebutuhan kuota sambil merencanakan rute perjalanan",
    paragraphs: [
      "Kebutuhan data setiap traveler berbeda. Peta, pesan, panggilan video, unggahan foto, dan hotspot memakai data dengan pola yang tidak sama; penggunaan Wi-Fi juga memengaruhi kebutuhan paket.",
      "Mulailah dari lama perjalanan dan aplikasi yang paling sering dipakai. Bandingkan kuota serta masa aktif yang tercantum di setiap paket, lalu pilih yang sesuai rute dan kebiasaanmu. Periksa kebijakan pemakaian wajar pada paket jika tersedia.",
    ],
    steps: [
      {
        title: "Catat durasi perjalanan",
        body: "Hitung jumlah hari paket perlu digunakan dan cocokkan dengan masa aktif yang tercantum.",
      },
      {
        title: "Perkirakan penggunaan harian",
        body: "Pertimbangkan navigasi, pesan, media sosial, video, dan apakah kamu akan berbagi hotspot.",
      },
      {
        title: "Bandingkan rincian paket",
        body: "Periksa kuota, cakupan, masa aktif, harga, dan ketentuan lain pada halaman detail sebelum checkout.",
      },
    ],
    relatedDestinations: [
      { code: "jp", label: "Paket eSIM Jepang" },
      { code: "asia", label: "Paket eSIM Asia" },
    ],
  },
  {
    slug: "cara-cek-hp-kompatibel-esim",
    title: "Cara Cek HP Kompatibel eSIM Sebelum Membeli",
    description:
      "Periksa dukungan eSIM dan status kunci operator pada ponsel sebelum membeli paket internet untuk perjalanan.",
    eyebrow: "PANDUAN PERANGKAT",
    heading: "Pastikan ponsel siap memakai eSIM sebelum membeli",
    publishedAt: "2026-10-30",
    updatedAt: "2026-10-30",
    readTime: "5 menit baca",
    image: "/assets/guides/cek-kompatibilitas-esim.jpg",
    imageAlt: "Traveler memeriksa ikon eSIM dan tanda kompatibilitas pada ponsel di bandara",
    paragraphs: [
      "Dukungan eSIM berbeda menurut model, varian negara, perangkat lunak, dan operator. Nama seri saja belum cukup untuk memastikan ponsel dapat memakai paket perjalanan tertentu. Cocokkan nomor model dengan daftar resmi produsen dan syarat paket sebelum membeli.",
      "Pada iPhone, buka Pengaturan > Umum > Mengenai dan periksa Kunci Operator. Apple menyebut “Tidak ada pembatasan SIM” sebagai tanda iPhone tidak terkunci. Pada Galaxy, menu Pengaturan > Koneksi > Manajer SIM dapat menunjukkan opsi tambah eSIM pada model yang mendukungnya. Letak menu dan dukungan dapat berbeda menurut model atau wilayah.",
      "Jika ragu, tanyakan ke produsen atau operator dengan nomor model perangkat. Jangan bagikan IMEI atau EID di ruang publik. Pastikan juga perangkat dapat memakai jaringan pada negara tujuan dan profil eSIM yang dibeli.",
    ],
    steps: [
      {
        title: "Temukan nomor model yang tepat",
        body: "Periksa halaman Mengenai di pengaturan ponsel. Gunakan nomor model lengkap saat mencari daftar kompatibilitas resmi.",
      },
      {
        title: "Periksa opsi eSIM dan kunci operator",
        body: "Lihat menu SIM di perangkat dan pastikan tidak ada pembatasan operator yang mencegah penggunaan penyedia lain.",
      },
      {
        title: "Cocokkan negara dan paket",
        body: "Tinjau cakupan paket serta dukungan band/jaringan untuk negara tujuan. Konfirmasi ke produsen atau operator jika belum yakin.",
      },
    ],
    sources: [
      { label: "Apple: menggunakan eSIM saat bepergian", url: "https://support.apple.com/en-us/118227" },
      { label: "Samsung: eSIM dan perangkat Galaxy yang didukung", url: "https://www.samsung.com/sg/support/mobile-devices/galaxy-esim-and-supported-network-carriers/" },
    ],
    relatedDestinations: [
      { code: "jp", label: "Paket eSIM Jepang" },
      { code: "sg", label: "Paket eSIM Singapura" },
    ],
  },
  {
    slug: "esim-atau-roaming-saat-liburan",
    title: "eSIM atau Roaming: Mana yang Cocok untuk Liburan?",
    description:
      "Bandingkan eSIM perjalanan dan roaming operator dari sisi harga, cakupan, nomor telepon, serta cara aktivasi.",
    eyebrow: "PANDUAN KONEKSI",
    heading: "Pilih eSIM atau roaming berdasarkan kebutuhan perjalananmu",
    publishedAt: "2026-10-30",
    updatedAt: "2026-10-30",
    readTime: "5 menit baca",
    image: "/assets/guides/esim-vs-roaming.jpg",
    imageAlt: "Traveler membandingkan simbol eSIM dan jaringan roaming pada ponsel di bandara",
    paragraphs: [
      "eSIM perjalanan dan roaming sama-sama dapat menghubungkan ponsel ke jaringan seluler di luar negeri. Pilihan terbaik bergantung pada negara tujuan, kebutuhan nomor utama, harga paket, dan aturan operator yang digunakan.",
      "Roaming dapat praktis bila operator rumah menyediakan paket untuk tujuanmu dan kamu ingin tetap memakai nomor yang sama. Periksa harga, kuota, masa berlaku, serta biaya di luar paket langsung ke operator. Ketentuan berbeda antaroperator dan negara.",
      "eSIM perjalanan dapat menjadi pilihan untuk data saat bepergian, sementara SIM utama tetap digunakan sesuai pengaturan perangkat dan paket. Sebelum membeli, cocokkan cakupan, jumlah data, masa aktif, kebijakan hotspot, serta waktu mulai paket. Jangan menganggap semua eSIM menyertakan nomor untuk panggilan atau SMS biasa.",
    ],
    steps: [
      {
        title: "Tentukan apakah nomor utama harus aktif",
        body: "Pikirkan kebutuhan menerima panggilan atau SMS ke nomor rumah dan cek biaya yang dikenakan operator saat roaming.",
      },
      {
        title: "Bandingkan biaya total",
        body: "Bandingkan tarif roaming operator dengan harga eSIM untuk cakupan, kuota, dan masa aktif yang sebanding.",
      },
      {
        title: "Periksa aturan sebelum berangkat",
        body: "Pastikan ponsel kompatibel, cakupan sesuai rute, dan kamu memahami kapan layanan mulai aktif serta bagaimana memilih jalur data.",
      },
    ],
    sources: [
      { label: "Apple: opsi roaming dan eSIM saat bepergian", url: "https://support.apple.com/en-us/118227" },
    ],
    relatedDestinations: [
      { code: "jp", label: "Paket eSIM Jepang" },
      { code: "asia", label: "Paket eSIM Asia" },
    ],
  },
  {
    slug: "kapan-memasang-dan-mengaktifkan-esim",
    title: "Kapan Memasang dan Mengaktifkan eSIM Perjalanan?",
    description:
      "Ketahui perbedaan memasang profil dan memulai masa aktif agar persiapan eSIM sesuai petunjuk paket.",
    eyebrow: "PANDUAN AKTIVASI",
    heading: "Atur waktu pemasangan eSIM sebelum berangkat",
    publishedAt: "2026-10-30",
    updatedAt: "2026-10-30",
    readTime: "4 menit baca",
    image: "/assets/guides/waktu-aktivasi-esim.jpg",
    imageAlt: "Traveler memasang eSIM pada malam sebelum keberangkatan dengan koper yang sudah disiapkan",
    paragraphs: [
      "Pemasangan profil eSIM dan dimulainya masa aktif tidak selalu terjadi pada saat yang sama. Cara aktivasi dan pemicu masa berlaku berbeda menurut penyedia serta paket, sehingga jangan mengandalkan aturan umum dari paket lain.",
      "Sebelum memindai kode atau memasang profil, baca petunjuk pesanan: kapan profil boleh dipasang, kapan masa aktif mulai dihitung, dan apakah profil dapat dipasang ulang. Siapkan Wi-Fi yang stabil, daya baterai cukup, dan akses ke instruksi jika perlu pemecahan masalah.",
      "Setelah tiba, pilih jalur data sesuai petunjuk paket dan aktifkan roaming data hanya jika diminta penyedia eSIM tersebut. Periksa pengaturan SIM utama agar tidak terkena biaya roaming yang tidak diinginkan. Simpan QR atau detail aktivasi secara aman dan jangan menghapus profil tanpa arahan resmi.",
    ],
    steps: [
      {
        title: "Baca aturan aktivasi paket",
        body: "Cari tahu apakah profil bisa dipasang sebelum perjalanan dan peristiwa apa yang memulai masa aktif.",
      },
      {
        title: "Siapkan ponsel dan koneksi",
        body: "Pastikan perangkat kompatibel, baterai cukup, dan tersedia koneksi Wi-Fi yang stabil saat mengikuti proses pemasangan.",
      },
      {
        title: "Pilih jalur data saat waktunya",
        body: "Ikuti instruksi penyedia mengenai jalur data dan roaming. Jika waktu aktivasi tidak jelas, tanyakan sebelum memasang profil.",
      },
    ],
    sources: [
      { label: "Apple: cara mengatur eSIM di iPhone", url: "https://support.apple.com/en-us/118669" },
      { label: "Samsung: eSIM dan perangkat Galaxy yang didukung", url: "https://www.samsung.com/sg/support/mobile-devices/galaxy-esim-and-supported-network-carriers/" },
    ],
    relatedDestinations: [
      { code: "jp", label: "Paket eSIM Jepang" },
      { code: "sg", label: "Paket eSIM Singapura" },
    ],
  },
];

export function getTravelGuide(slug: string): TravelGuide | undefined {
  return travelGuides.find((guide) => guide.slug === slug);
}

export function getNewestTravelGuides(limit?: number): TravelGuide[] {
  const newestFirst = [...travelGuides].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
  return limit === undefined ? newestFirst : newestFirst.slice(0, limit);
}

export function formatTravelGuideDate(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export const travelGuideSlugs = travelGuides.map(({ slug }) => slug);
