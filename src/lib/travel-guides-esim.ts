import type { TravelGuide } from "./travel-guides";

/**
 * Ten explainer and how-to guides written to answer the questions Indonesian travelers type into
 * Google and ask AI assistants. Each opens with a short answer-first summary, carries a visible FAQ
 * (also emitted as FAQPage JSON-LD) and cites only vendor/official pages. No prices, operator names,
 * speeds or coverage claims are stated; those live on the live catalogue pages.
 */
const APPLE_TRAVEL = {
  label: "Apple: menggunakan eSIM saat bepergian internasional",
  url: "https://support.apple.com/en-us/118227",
};
const APPLE_SETUP = {
  label: "Apple: mengatur eSIM di iPhone",
  url: "https://support.apple.com/en-us/118669",
};
const APPLE_TROUBLE = {
  label: "Apple: jika tidak dapat mengatur eSIM di iPhone",
  url: "https://support.apple.com/en-us/102478",
};
const APPLE_DATA = {
  label: "Apple: melihat dan mengatur penggunaan data seluler",
  url: "https://support.apple.com/en-us/109323",
};
const SAMSUNG_ESIM = {
  label: "Samsung: Galaxy eSIM dan perangkat yang didukung",
  url: "https://www.samsung.com/sg/support/mobile-devices/galaxy-esim-and-supported-network-carriers/",
};
const MAPS_OFFLINE = {
  label: "Google Maps: mengunduh peta dan batas penggunaan offline",
  url: "https://support.google.com/maps/answer/6291838?co=GENIE.Platform%3DiOS&hl=en",
};

const PUBLISHED = "2026-11-24";

export const esimExplainerGuides: readonly TravelGuide[] = [
  {
    slug: "apa-itu-esim-panduan-lengkap-traveler",
    title: "Apa Itu eSIM? Panduan Lengkap untuk Traveler Indonesia",
    description:
      "Pengertian eSIM, cara kerjanya, kelebihan dan batasannya, serta apa yang perlu dicek sebelum membeli eSIM untuk perjalanan ke luar negeri.",
    eyebrow: "PANDUAN eSIM",
    heading: "eSIM menurut traveler: apa itu, cara kerja, dan kapan cocok dipakai",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "4 menit baca",
    image: "/assets/guides/cek-kompatibilitas-esim.jpg",
    imageAlt: "Ponsel yang menampilkan pengaturan eSIM sebelum perjalanan ke luar negeri",
    keywords: ["apa itu eSIM", "eSIM adalah", "cara kerja eSIM", "eSIM untuk traveler"],
    summary:
      "eSIM adalah SIM digital yang sudah tertanam di ponsel, sehingga profil operator dipasang lewat QR code atau tautan tanpa kartu fisik. Traveler memakainya untuk membeli paket data negara tujuan sebelum berangkat, sambil tetap menyimpan SIM utama. Ponsel harus mendukung eSIM dan tidak terkunci operator.",
    paragraphs: [
      "eSIM, kependekan dari embedded SIM, adalah chip SIM yang sudah menyatu di dalam ponsel. Operator tidak mengirim kartu plastik; mereka mengirim profil digital yang kamu pasang lewat pemindaian QR code, tautan, atau kode manual. Setelah terpasang, profil itu berfungsi seperti kartu SIM: ia menghubungkan ponsel ke jaringan seluler untuk data, dan pada sebagian paket juga panggilan atau SMS.",
      "Banyak ponsel modern bisa menyimpan lebih dari satu profil eSIM, tetapi hanya sebagian yang aktif bersamaan, tergantung model. Karena itu kamu bisa tetap memakai SIM utama dari Indonesia untuk menerima pesan, lalu memakai eSIM khusus negara tujuan untuk data. Pemisahan ini yang membuat eSIM populer di kalangan traveler: tidak perlu membongkar slot SIM, tidak ada kartu kecil yang hilang, dan paket bisa dibeli sebelum berangkat.",
      "Kelebihannya jelas, tetapi eSIM tetap punya batas. Ponsel harus mendukung eSIM dan tidak terkunci operator. Banyak paket eSIM wisata hanya menyediakan data, sehingga nomor telepon biasa tidak ikut tersedia. Aturan kapan masa aktif mulai dihitung, boleh tidaknya hotspot, dan kecepatan setelah kuota tertentu berbeda-beda antar paket, jadi baca detail paket, bukan hanya jumlah kuota.",
      "Pemasangan eSIM umumnya butuh koneksi internet saat profil diunduh. Pasang lewat Wi-Fi rumah atau hotel, simpan QR code dan petunjuk di tempat yang bisa dibuka tanpa koneksi, lalu ikuti waktu aktivasi yang tertulis pada paket. Pemasangan yang dilakukan jauh-jauh hari tidak berarti paket langsung aktif; pada sebagian paket masa aktif baru dihitung saat tersambung ke jaringan tujuan.",
    ],
    steps: [
      {
        title: "Pastikan ponsel mendukung eSIM",
        body: "Cek menu Seluler atau Koneksi untuk opsi tambah eSIM, dan pastikan ponsel tidak terkunci operator. Panduan cek perangkat kami membahas langkahnya.",
      },
      {
        title: "Pilih paket sesuai negara dan lama perjalanan",
        body: "Samakan cakupan negara, masa aktif, dan kuota dengan rencana perjalananmu, lalu baca ketentuan hotspot dan kecepatan.",
      },
      {
        title: "Pasang profil lewat Wi-Fi",
        body: "Pindai QR code atau masukkan kode manual saat tersambung Wi-Fi, lalu beri nama profil yang mudah dikenali seperti Jepang atau Singapura.",
      },
      {
        title: "Aktifkan data seluler eSIM saat tiba",
        body: "Pilih eSIM sebagai jalur data, aktifkan roaming data untuk profil itu bila diminta petunjuk paket, dan matikan roaming data pada SIM utama.",
      },
    ],
    faqs: [
      {
        question: "Apa itu eSIM?",
        answer:
          "eSIM adalah SIM digital yang tertanam di ponsel. Profil operator dipasang lewat QR code atau tautan sehingga tidak perlu kartu SIM fisik.",
      },
      {
        question: "Apakah eSIM menggantikan nomor telepon saya?",
        answer:
          "Tidak. Untuk traveler, eSIM paket data biasanya dipakai berdampingan dengan SIM utama. Nomor utama tetap bisa dipakai untuk pesan, sedangkan eSIM menyediakan data di negara tujuan.",
      },
      {
        question: "Apakah semua ponsel mendukung eSIM?",
        answer:
          "Tidak. Ponsel harus punya dukungan eSIM dan tidak terkunci operator. Periksa menu Seluler atau Koneksi, atau lihat daftar perangkat resmi dari pembuat ponsel.",
      },
    ],
    sources: [APPLE_TRAVEL, APPLE_SETUP, SAMSUNG_ESIM],
    relatedDestinations: [
      { code: "jp", label: "Lihat paket eSIM Jepang" },
      { code: "sg", label: "Lihat paket eSIM Singapura" },
    ],
    relatedLinks: [
      { guide: "cara-cek-hp-kompatibel-esim", label: "Cek HP kompatibel eSIM" },
      { guide: "cara-memasang-esim-sebelum-berangkat", label: "Cara memasang eSIM" },
    ],
  },
  {
    slug: "esim-tidak-ada-sinyal-cara-mengatasi",
    title: "eSIM Tidak Ada Sinyal di Luar Negeri? Ini Cara Mengatasinya",
    description:
      "Daftar pemeriksaan saat eSIM terpasang tetapi tidak ada sinyal atau data: jalur data, roaming, mode pesawat, pemilihan jaringan, dan kapan perlu menghubungi bantuan.",
    eyebrow: "PANDUAN MASALAH",
    heading: "Urutan pemeriksaan saat eSIM sudah terpasang tetapi tidak ada data",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "4 menit baca",
    image: "/assets/guides/pasang-esim-perjalanan.jpg",
    imageAlt: "Traveler memeriksa pengaturan data seluler eSIM di ponsel",
    keywords: [
      "eSIM tidak ada sinyal",
      "eSIM tidak bisa internet",
      "data eSIM tidak jalan",
      "troubleshooting eSIM",
    ],
    summary:
      "Jika eSIM tidak mendapat sinyal, periksa berurutan: profil eSIM aktif, jalur data seluler diarahkan ke eSIM, roaming data eSIM menyala, mode pesawat dimatikan lalu dinyalakan, pilih jaringan manual, dan restart ponsel. Bila masih gagal, hubungi bantuan dengan menyebut model ponsel dan lokasi.",
    paragraphs: [
      "eSIM yang tidak mendapat data hampir selalu bermasalah di pengaturan, bukan di perangkatnya. Penyebab paling sering ada tiga: profil eSIM belum diaktifkan, ponsel masih memakai SIM utama sebagai jalur data, atau roaming data pada profil eSIM belum menyala. Periksa ketiganya lebih dulu sebelum mengira paketnya rusak.",
      "Buka pengaturan seluler dan pastikan baris eSIM berstatus aktif. Lalu lihat bagian Data Seluler dan arahkan ke eSIM. Pada banyak paket perjalanan, opsi Roaming Data pada profil eSIM perlu dinyalakan, karena jaringan yang dipakai berada di luar negeri; sebaliknya, matikan roaming data pada SIM utama agar tidak terkena biaya yang tidak direncanakan.",
      "Jika data masih mati, nyalakan mode pesawat selama beberapa detik lalu matikan kembali agar ponsel mencari jaringan ulang. Setelah itu coba restart ponsel. Bila ponsel tetap tidak mendapat sinyal, buka pemilihan jaringan dan coba pilih jaringan secara manual dari daftar yang tersedia di lokasimu; paket biasanya hanya bekerja pada jaringan tertentu sesuai ketentuan penyedia.",
      "Perhatikan juga hal sederhana: kuota atau masa aktif yang sudah habis, lokasi tanpa sinyal seperti basement atau dalam kereta bawah tanah, dan aturan aktivasi paket. Beberapa paket baru mulai berjalan ketika ponsel tersambung ke jaringan negara tujuan, jadi jangan menyimpulkan paket gagal saat masih di pesawat atau di bandara asal. Jika semua langkah sudah dicoba, kumpulkan informasi untuk bantuan: model ponsel, versi sistem, lokasi, waktu kejadian, dan tangkapan layar pengaturan seluler.",
    ],
    steps: [
      {
        title: "Pastikan eSIM aktif",
        body: "Buka pengaturan seluler dan pastikan profil eSIM menyala, bukan hanya terpasang.",
      },
      {
        title: "Arahkan data seluler ke eSIM",
        body: "Pilih eSIM sebagai jalur Data Seluler, nyalakan Roaming Data pada profil eSIM, dan matikan roaming pada SIM utama.",
      },
      {
        title: "Segarkan koneksi",
        body: "Nyalakan mode pesawat beberapa detik, matikan lagi, lalu restart ponsel. Coba pilih jaringan manual bila tersedia.",
      },
      {
        title: "Kumpulkan data untuk bantuan",
        body: "Siapkan model ponsel, lokasi, waktu, dan tangkapan layar pengaturan seluler lalu hubungi bantuan Djiwa Travel.",
      },
    ],
    faqs: [
      {
        question: "Kenapa eSIM sudah terpasang tapi tidak ada internet?",
        answer:
          "Penyebab paling umum adalah data seluler belum diarahkan ke eSIM, roaming data eSIM belum menyala, atau masa aktif paket belum berjalan. Periksa pengaturan seluler terlebih dulu.",
      },
      {
        question: "Apakah roaming data perlu dinyalakan untuk eSIM?",
        answer:
          "Pada banyak paket perjalanan, ya, untuk profil eSIM tersebut. Matikan roaming data pada SIM utama agar tidak ada biaya yang tidak direncanakan.",
      },
      {
        question: "Perlu hapus dan pasang ulang eSIM?",
        answer:
          "Jangan hapus profil sebelum bertanya ke bantuan. Banyak profil eSIM hanya bisa dipasang sekali, sehingga profil yang dihapus mungkin tidak bisa dipasang ulang.",
      },
    ],
    sources: [APPLE_TROUBLE, APPLE_TRAVEL],
    relatedDestinations: [{ code: "asia", label: "Bandingkan paket Asia" }],
    relatedLinks: [
      { guide: "kapan-memasang-dan-mengaktifkan-esim", label: "Kapan eSIM dipasang dan aktif" },
      { guide: "cara-memasang-esim-sebelum-berangkat", label: "Cara memasang eSIM" },
    ],
  },
  {
    slug: "esim-vs-sim-lokal-vs-wifi-portabel",
    title: "eSIM vs SIM Lokal vs Wi-Fi Portabel: Mana yang Cocok?",
    description:
      "Bandingkan eSIM, kartu SIM lokal, dan Wi-Fi portabel dari sisi kemudahan, perangkat, baterai, dan fleksibilitas untuk traveler Indonesia.",
    eyebrow: "PANDUAN KONEKSI",
    heading: "Pilih cara tetap online berdasarkan ponsel, rombongan, dan itinerary",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "4 menit baca",
    image: "/assets/guides/esim-vs-roaming.jpg",
    imageAlt: "Traveler membandingkan pilihan koneksi internet sebelum berangkat",
    keywords: ["eSIM vs SIM lokal", "eSIM vs pocket wifi", "internet murah di luar negeri"],
    summary:
      "eSIM cocok untuk ponsel yang mendukungnya dan tidak butuh kartu fisik. SIM lokal cocok bila ponsel tidak mendukung eSIM, tetapi harus dicari dan dipasang di tujuan. Wi-Fi portabel cocok untuk rombongan yang berbagi satu koneksi, dengan konsekuensi membawa dan mengisi daya perangkat tambahan.",
    paragraphs: [
      "Tiga pilihan paling umum untuk tetap online di luar negeri adalah eSIM, kartu SIM lokal, dan Wi-Fi portabel. Tidak ada yang selalu terbaik; yang tepat bergantung pada ponselmu, siapa yang ikut, dan seberapa lama perjalanannya. Mulai dari ponsel: bila mendukung eSIM, kamu punya opsi paling praktis. Bila tidak, SIM lokal atau Wi-Fi portabel jadi pilihan.",
      "eSIM unggul pada kenyamanan. Paket bisa dibeli dan dipasang sebelum berangkat, tidak ada kartu yang perlu diganti, dan SIM utama tetap di ponsel. Kekurangannya: ponsel harus kompatibel, dan setiap orang membutuhkan profilnya sendiri bila memakai ponsel masing-masing.",
      "SIM lokal bergantung pada ketersediaan di tujuan: kamu perlu menemukan gerai atau mesin penjual, membawa paspor bila diminta, dan mengganti kartu fisik. Cara ini cocok untuk ponsel tanpa eSIM, tetapi bisa memakan waktu di hari pertama dan mengharuskan SIM utama dicabut atau memakai slot kedua.",
      "Wi-Fi portabel membagi satu koneksi ke beberapa perangkat sehingga praktis untuk keluarga atau rombongan. Perangkatnya harus diambil, diisi daya, dan dikembalikan sesuai aturan penyewaan, dan koneksi berhenti saat kamu terpisah dari pembawanya. Untuk perjalanan sendiri atau ketika semua orang membawa ponsel pintar, eSIM biasanya lebih ringkas.",
    ],
    steps: [
      {
        title: "Cek dukungan eSIM di ponselmu",
        body: "Jika ponsel kompatibel dan tidak terkunci operator, eSIM adalah pilihan yang paling sedikit langkahnya.",
      },
      {
        title: "Hitung siapa yang butuh koneksi",
        body: "Satu orang atau semua orang bepergian bersama menentukan apakah satu perangkat bersama atau satu profil per ponsel lebih cocok.",
      },
      {
        title: "Periksa ketentuan tiap pilihan",
        body: "Bandingkan masa aktif, kuota, hotspot, biaya sewa atau deposit, dan cara mengembalikan atau menonaktifkan layanan.",
      },
      {
        title: "Siapkan cadangan",
        body: "Unduh peta offline dan simpan dokumen penting sehingga perjalanan tetap lancar jika koneksi bermasalah.",
      },
    ],
    faqs: [
      {
        question: "Apakah eSIM lebih murah dari SIM lokal?",
        answer:
          "Tidak selalu. Harga bergantung pada negara, kuota, dan masa aktif. Bandingkan harga dan ketentuan paket, bukan hanya jenis layanannya.",
      },
      {
        question: "Lebih baik eSIM atau Wi-Fi portabel untuk keluarga?",
        answer:
          "Jika setiap orang memegang ponsel kompatibel, eSIM per ponsel menghindari satu titik gagal. Wi-Fi portabel praktis saat banyak perangkat harus berbagi satu koneksi dan semua tetap berdekatan.",
      },
      {
        question: "Bisa pakai eSIM sambil menyimpan nomor Indonesia?",
        answer:
          "Bisa pada ponsel dengan dukungan dua SIM, termasuk satu eSIM. Nomor utama tetap aktif dan eSIM dipakai sebagai jalur data.",
      },
    ],
    sources: [APPLE_TRAVEL, SAMSUNG_ESIM],
    relatedDestinations: [
      { code: "jp", label: "Lihat paket eSIM Jepang" },
      { code: "sg", label: "Lihat paket eSIM Singapura" },
    ],
    relatedLinks: [
      { guide: "esim-atau-roaming-saat-liburan", label: "eSIM atau roaming operator" },
    ],
  },
  {
    slug: "cara-menerima-otp-dan-whatsapp-saat-di-luar-negeri",
    title: "Menerima OTP dan WhatsApp Saat di Luar Negeri dengan eSIM",
    description:
      "Cara tetap bisa memakai WhatsApp, login bank, dan kode OTP saat bepergian ke luar negeri memakai eSIM data tanpa kehilangan nomor Indonesiamu.",
    eyebrow: "PANDUAN eSIM",
    heading: "Pakai eSIM untuk data, tetapi jangan lupa rencana untuk OTP",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "4 menit baca",
    image: "/assets/guides/pasang-esim-perjalanan.jpg",
    imageAlt: "Ponsel dengan dua SIM menampilkan pesan dan kode verifikasi saat bepergian",
    keywords: [
      "OTP di luar negeri",
      "WhatsApp eSIM",
      "terima SMS di luar negeri",
      "nomor Indonesia eSIM",
    ],
    summary:
      "Memasang eSIM data tidak memindahkan nomor Indonesiamu. WhatsApp yang sudah terdaftar tetap berjalan lewat data eSIM. Untuk OTP via SMS, nomor utama harus bisa menerima pesan, atau pindahkan verifikasi ke aplikasi autentikator sebelum berangkat.",
    paragraphs: [
      "Kekhawatiran paling umum saat beralih ke eSIM data adalah nomor telepon. Jawabannya: eSIM wisata biasanya hanya menambah jalur data. Nomor Indonesiamu tetap ada di SIM utama dan bisa menerima SMS selama SIM itu tetap terpasang, aktif, dan mendapat sinyal, termasuk saat roaming.",
      "WhatsApp, Telegram, dan aplikasi pesan lain bekerja lewat internet. Selama akunmu sudah terdaftar, aplikasi tetap berfungsi lewat data eSIM tanpa harus menerima SMS baru. Masalah baru muncul saat verifikasi ulang: login di ponsel baru, atau pendaftaran ulang akun, membutuhkan kode via SMS atau panggilan ke nomor lama.",
      "Untuk rekening bank dan dompet digital, banyak layanan memakai OTP via SMS. Karena roaming SMS bisa dikenakan biaya atau terbatas, cek lebih dulu kebijakan operatormu. Sebelum berangkat, pindahkan verifikasi ke aplikasi autentikator atau token yang tersedia dari bank, dan simpan kode cadangan di tempat aman bila layanannya menyediakan.",
      "Jangan menonaktifkan SIM utama sepenuhnya jika kamu masih mungkin menerima kode penting. Cukup matikan roaming data pada SIM itu agar internet berjalan melalui eSIM, dan biarkan SIM tetap menerima SMS. Setel agar SIM utama dipakai untuk panggilan dan pesan, sedangkan data seluler diarahkan ke eSIM.",
    ],
    steps: [
      {
        title: "Periksa kebutuhan OTP sebelum berangkat",
        body: "Daftar aplikasi bank, e-wallet, dan email yang meminta kode SMS saat login.",
      },
      {
        title: "Pindahkan verifikasi ke aplikasi autentikator",
        body: "Aktifkan autentikator atau token digital bila layanan menyediakan, dan simpan kode cadangan secara aman.",
      },
      {
        title: "Atur dua SIM dengan benar",
        body: "Biarkan SIM utama untuk panggilan dan pesan, arahkan data seluler ke eSIM, dan matikan roaming data pada SIM utama.",
      },
      {
        title: "Uji sebelum terbang",
        body: "Buka WhatsApp dan aplikasi penting lewat Wi-Fi sambil memastikan semua tetap tersambung setelah mode pesawat dinyalakan lalu dimatikan.",
      },
    ],
    faqs: [
      {
        question: "Apakah nomor WhatsApp saya berubah jika memakai eSIM?",
        answer:
          "Tidak. Nomor WhatsApp terikat pada akunmu, bukan pada jalur data. Aplikasi akan terus berjalan lewat internet dari eSIM.",
      },
      {
        question: "Apakah eSIM data bisa menerima SMS OTP?",
        answer:
          "Banyak paket wisata hanya menyediakan data. OTP SMS tetap masuk ke SIM utama yang menyimpan nomormu, jadi biarkan SIM itu aktif dan periksa biaya roaming SMS dari operatormu.",
      },
      {
        question: "Bagaimana cara aman agar tidak terkunci dari akun bank?",
        answer:
          "Siapkan verifikasi lewat aplikasi autentikator atau token dan simpan kode cadangan sebelum berangkat, lalu uji login lewat Wi-Fi.",
      },
    ],
    sources: [APPLE_TRAVEL, APPLE_SETUP],
    relatedDestinations: [{ code: "asia", label: "Bandingkan paket Asia" }],
    relatedLinks: [
      { guide: "esim-atau-roaming-saat-liburan", label: "eSIM atau roaming operator" },
      { guide: "keamanan-data-wifi-publik-saat-traveling", label: "Keamanan Wi-Fi publik" },
    ],
  },
  {
    slug: "esim-korea-selatan-untuk-liburan",
    title: "eSIM Korea Selatan untuk Liburan: Cara Memilih dan Memakai",
    description:
      "Panduan memilih eSIM Korea Selatan: cakupan, masa aktif, kuota, aplikasi peta yang umum dipakai, dan hal yang perlu disiapkan sebelum mendarat.",
    eyebrow: "PANDUAN KOREA",
    heading: "Siapkan koneksi untuk Seoul, Busan, dan Jeju sebelum berangkat",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "4 menit baca",
    image: "/assets/guides/esim-jepang-kuota.jpg",
    imageAlt: "Traveler merencanakan koneksi internet untuk perjalanan di Asia Timur",
    keywords: ["eSIM Korea Selatan", "eSIM Korea", "internet di Korea", "eSIM Seoul"],
    summary:
      "Untuk Korea Selatan, pilih eSIM yang eksplisit mencakup negaranya, sesuaikan masa aktif dengan tanggal terbang, dan perkirakan kuota dari pemakaian peta, pesan, serta video. Siapkan aplikasi peta lokal karena fitur navigasi Google Maps di sana terbatas, lalu unduh peta dan tiket sebelum berangkat.",
    paragraphs: [
      "Korea Selatan menarik wisatawan untuk kota besar seperti Seoul dan Busan hingga Pulau Jeju. Perjalanan biasanya padat transportasi umum, jadi peta, jadwal, dan pesan sering dibuka. Karena itu pilih eSIM yang mencantumkan Korea Selatan secara jelas pada daftar cakupan, bukan mengandalkan asumsi dari paket regional.",
      "Sesuaikan masa aktif dengan tanggal perjalanan, termasuk hari kedatangan dan kepulangan. Baca kapan masa aktif mulai dihitung: ada paket yang dihitung sejak profil dipasang, ada yang sejak pertama kali tersambung ke jaringan tujuan. Pada paket yang menghitung dari jaringan tujuan, pemasangan profil di Indonesia umumnya tidak memulai masa aktif; ikuti petunjuk paket.",
      "Untuk navigasi, fitur petunjuk arah Google Maps di Korea Selatan terbatas, sehingga banyak traveler memakai aplikasi peta lokal seperti Naver Map atau KakaoMap. Pasang dan coba aplikasinya di rumah, simpan alamat penginapan dalam huruf Hangul bila tersedia, dan unduh peta wilayah yang akan dikunjungi supaya tetap bisa dibuka saat sinyal lemah.",
      "Syarat masuk, izin perjalanan, dan aturan bawaan dapat berubah, jadi cek informasi resmi dari imigrasi Korea Selatan dan perwakilan Korea di Indonesia sebelum membeli tiket. Setelah semuanya siap, bandingkan paket eSIM dan perhatikan ketentuan hotspot bila kamu berbagi koneksi ke laptop atau teman seperjalanan.",
    ],
    steps: [
      {
        title: "Cocokkan cakupan Korea Selatan",
        body: "Pastikan Korea Selatan tercantum pada cakupan paket, lalu cocokkan dengan jumlah hari termasuk hari kedatangan.",
      },
      {
        title: "Perkirakan kuota harian",
        body: "Hitung dari pemakaian peta, pesan, media sosial, dan video, lalu tambahkan cadangan kecil untuk hari tak terduga.",
      },
      {
        title: "Siapkan aplikasi peta dan terjemahan",
        body: "Pasang aplikasi peta lokal dan unduh peta wilayah tujuan selagi masih terhubung Wi-Fi.",
      },
      {
        title: "Pasang eSIM dan cek persyaratan masuk",
        body: "Ikuti waktu aktivasi paket, dan periksa aturan masuk terbaru dari sumber resmi sebelum berangkat.",
      },
    ],
    faqs: [
      {
        question: "Apakah eSIM Korea Selatan perlu dipasang sebelum berangkat?",
        answer:
          "Disarankan memasang profil lewat Wi-Fi sebelum berangkat, tetapi ikuti petunjuk paket tentang kapan masa aktif mulai dihitung.",
      },
      {
        question: "Aplikasi peta apa yang cocok di Korea Selatan?",
        answer:
          "Fitur navigasi Google Maps di Korea Selatan terbatas. Banyak traveler memakai Naver Map atau KakaoMap sebagai pelengkap.",
      },
      {
        question: "Berapa kuota yang cukup untuk liburan di Korea?",
        answer:
          "Bergantung pada kebiasaanmu. Peta dan pesan hemat data, sedangkan video dan hotspot memakan lebih banyak. Ukur pemakaian harian lalu kalikan jumlah hari.",
      },
    ],
    sources: [APPLE_TRAVEL, APPLE_DATA, MAPS_OFFLINE],
    relatedDestinations: [{ code: "asia", label: "Bandingkan paket Asia" }],
    relatedLinks: [
      { guide: "cara-memilih-kuota-internet-saat-traveling", label: "Cara memilih kuota" },
      { guide: "cara-memasang-esim-sebelum-berangkat", label: "Cara memasang eSIM" },
    ],
  },
  {
    slug: "esim-thailand-bangkok-phuket-panduan",
    title: "eSIM Thailand untuk Bangkok dan Phuket: Panduan Memilih Paket",
    description:
      "Cara memilih eSIM Thailand untuk Bangkok, Chiang Mai, dan Phuket: cakupan, kuota, hotspot, aplikasi transportasi, serta persiapan sebelum mendarat.",
    eyebrow: "PANDUAN THAILAND",
    heading: "Tetap terhubung di Thailand tanpa ganti kartu SIM",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "4 menit baca",
    image: "/assets/guides/internet-singapura-malaysia.jpg",
    imageAlt: "Traveler memakai ponsel untuk memesan transportasi di kota Asia Tenggara",
    keywords: ["eSIM Thailand", "eSIM Bangkok", "eSIM Phuket", "internet di Thailand"],
    summary:
      "Pilih eSIM Thailand yang mencantumkan Thailand pada cakupan, sesuaikan masa aktif dan kuota dengan itinerary (Bangkok, Chiang Mai, Phuket), serta cek ketentuan hotspot. Pasang lewat Wi-Fi sebelum berangkat dan periksa persyaratan masuk terbaru dari sumber resmi.",
    paragraphs: [
      "Thailand populer untuk liburan singkat: Bangkok untuk kota, Chiang Mai untuk budaya, dan Phuket atau Krabi untuk pantai. Rute yang berpindah-pindah membuat koneksi stabil penting, terutama saat memesan transportasi, membuka peta, atau menerjemahkan menu. Mulailah dari daftar kota yang akan dikunjungi, lalu pastikan paket mencakup Thailand secara jelas.",
      "Banyak pelancong memesan kendaraan lewat aplikasi transportasi daring seperti Grab, yang membutuhkan data seluler aktif. Selain itu, area pulau atau kawasan wisata di pegunungan bisa memiliki sinyal yang berbeda dari pusat kota. Unduh peta offline dan simpan konfirmasi penginapan serta tiket transportasi agar tetap bisa dibuka bila sinyal melemah.",
      "Untuk kuota, hitung dari kebiasaanmu: peta dan pesan hemat data, sedangkan video, unggahan foto, dan hotspot menguras kuota lebih cepat. Jika kamu berbagi koneksi ke laptop atau teman, periksa apakah paket mengizinkan hotspot dan apakah ada pembatasan kecepatan setelah kuota tertentu.",
      "Aturan masuk dan dokumen kedatangan dapat berubah, termasuk pengisian data kedatangan secara digital bila diwajibkan. Cek informasi imigrasi resmi Thailand sebelum berangkat dan jangan bergantung pada informasi lama. Setelah itu pasang eSIM lewat Wi-Fi, ikuti petunjuk aktivasi paket, dan matikan roaming data pada SIM utama.",
    ],
    steps: [
      {
        title: "Tulis rute kota dan pulau",
        body: "Daftar kota yang dikunjungi menentukan masa aktif dan perkiraan kuota.",
      },
      {
        title: "Cek cakupan dan hotspot",
        body: "Pastikan Thailand tercantum pada cakupan dan baca ketentuan hotspot serta batas kecepatan.",
      },
      {
        title: "Siapkan aplikasi dan peta offline",
        body: "Pasang aplikasi transportasi dan peta, lalu unduh area Bangkok, Chiang Mai, atau Phuket saat Wi-Fi.",
      },
      {
        title: "Pasang eSIM dan cek aturan masuk",
        body: "Ikuti petunjuk aktivasi dan periksa persyaratan masuk terbaru dari situs resmi imigrasi.",
      },
    ],
    faqs: [
      {
        question: "Apakah eSIM Thailand bekerja di Phuket dan pulau lain?",
        answer:
          "Cakupan mengikuti ketentuan paket dan jaringan yang tersedia di lokasi. Baca detail paket, dan siapkan peta offline untuk area dengan sinyal lemah.",
      },
      {
        question: "Bisakah eSIM dipakai untuk memesan Grab?",
        answer:
          "Bisa selama data seluler aktif. Pastikan eSIM menjadi jalur data dan aplikasi sudah dipasang serta diuji sebelum berangkat.",
      },
      {
        question: "Kapan sebaiknya eSIM Thailand dipasang?",
        answer:
          "Pasang lewat Wi-Fi sebelum berangkat bila petunjuk paket mengizinkan. Ikuti aturan kapan masa aktif mulai dihitung.",
      },
    ],
    sources: [APPLE_TRAVEL, MAPS_OFFLINE],
    relatedDestinations: [{ code: "asia", label: "Bandingkan paket Asia" }],
    relatedLinks: [
      {
        guide: "tips-internet-traveling-ke-singapura-dan-malaysia",
        label: "Internet Singapura dan Malaysia",
      },
      { guide: "cara-memilih-kuota-internet-saat-traveling", label: "Cara memilih kuota" },
    ],
  },
  {
    slug: "keamanan-data-wifi-publik-saat-traveling",
    title: "Keamanan Data di Wi-Fi Publik Saat Traveling: Panduan Praktis",
    description:
      "Risiko Wi-Fi publik di bandara, hotel, dan kafe, serta langkah sederhana melindungi akun, bank, dan data pribadi saat bepergian.",
    eyebrow: "PANDUAN KEAMANAN",
    heading: "Lindungi akun dan data pribadi saat memakai Wi-Fi di tempat umum",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "4 menit baca",
    image: "/assets/guides/esim-vs-roaming.jpg",
    imageAlt: "Traveler memakai ponsel di tempat umum dengan koneksi internet",
    keywords: ["keamanan wifi publik", "wifi bandara aman", "melindungi data saat traveling"],
    summary:
      "Wi-Fi publik tidak selalu aman karena kamu tidak mengontrol jaringannya. Untuk akun penting dan transaksi, pakai data eSIM, hindari login bank di Wi-Fi terbuka, aktifkan verifikasi dua langkah, perbarui aplikasi sebelum berangkat, dan matikan sambung otomatis ke jaringan terbuka.",
    paragraphs: [
      "Wi-Fi gratis di bandara, hotel, dan kafe sangat membantu, tetapi kamu tidak mengendalikan siapa yang mengelola jaringan atau siapa saja yang tersambung. Jaringan palsu dengan nama mirip hotel atau bandara adalah teknik umum untuk memancing pengguna. Perlakukan Wi-Fi publik sebagai jaringan yang tidak sepenuhnya dipercaya.",
      "Untuk pekerjaan sensitif seperti login bank, transfer, atau mengisi data paspor, lebih aman memakai data seluler dari eSIM atau SIM utamamu. Koneksi seluler bukan jaminan mutlak, tetapi mengurangi risiko jaringan bersama yang dikelola pihak lain. Simpan Wi-Fi publik untuk hal ringan seperti mengunduh peta atau menjelajah.",
      "Aktifkan verifikasi dua langkah pada email, media sosial, dan layanan keuangan sebelum berangkat, dan perbarui aplikasi serta sistem operasi selagi di rumah. Pembaruan sering menutup celah keamanan yang diketahui. Matikan fitur sambung otomatis ke jaringan terbuka dan hapus jaringan lama yang tidak lagi kamu pakai.",
      "Perhatikan kebiasaan sehari-hari: pastikan alamat situs memakai HTTPS sebelum memasukkan data, jangan memasukkan kata sandi pada halaman masuk Wi-Fi yang meminta lebih dari yang diperlukan, dan pakai pengelola kata sandi agar tidak mengetik manual. Jika kehilangan ponsel, aktifkan fitur lacak dan hapus jarak jauh yang sudah disiapkan sebelumnya, dan segera ganti kata sandi akun penting.",
    ],
    steps: [
      {
        title: "Aktifkan verifikasi dua langkah",
        body: "Lakukan untuk email, bank, dan media sosial sebelum berangkat, dan simpan kode cadangan di tempat aman.",
      },
      {
        title: "Gunakan data eSIM untuk hal penting",
        body: "Login bank dan transaksi lebih baik lewat data seluler daripada Wi-Fi terbuka.",
      },
      {
        title: "Matikan sambung otomatis",
        body: "Nonaktifkan koneksi otomatis ke jaringan terbuka dan hapus jaringan Wi-Fi lama.",
      },
      {
        title: "Siapkan rencana jika ponsel hilang",
        body: "Aktifkan lacak ponsel, kunci layar, dan catat langkah mengganti kata sandi serta memblokir kartu.",
      },
    ],
    faqs: [
      {
        question: "Apakah Wi-Fi hotel aman untuk login bank?",
        answer:
          "Sebaiknya tidak. Jaringan bersama dikelola pihak lain. Untuk transaksi, gunakan data seluler dan aktifkan verifikasi dua langkah.",
      },
      {
        question: "Apakah eSIM lebih aman dari Wi-Fi publik?",
        answer:
          "Koneksi seluler tidak dibagi dengan pengguna sembarangan seperti Wi-Fi terbuka, sehingga lebih baik untuk hal sensitif. Tetap pakai HTTPS dan verifikasi dua langkah.",
      },
      {
        question: "Apa langkah pertama jika ponsel hilang saat traveling?",
        answer:
          "Kunci atau hapus ponsel dari jarak jauh, ganti kata sandi akun penting, dan hubungi bank bila ada aplikasi keuangan di ponsel itu.",
      },
    ],
    sources: [APPLE_TRAVEL],
    relatedDestinations: [{ code: "sg", label: "Lihat paket eSIM Singapura" }],
    relatedLinks: [
      {
        guide: "cara-menerima-otp-dan-whatsapp-saat-di-luar-negeri",
        label: "OTP dan WhatsApp di luar negeri",
      },
    ],
  },
  {
    slug: "cara-berbagi-hotspot-dari-esim-saat-traveling",
    title: "Cara Berbagi Hotspot dari eSIM Saat Traveling",
    description:
      "Cara berbagi koneksi eSIM ke laptop atau teman seperjalanan, hal yang perlu dicek pada paket, serta cara menghemat kuota dan baterai.",
    eyebrow: "PANDUAN KUOTA",
    heading: "Hotspot dari eSIM: cek ketentuan, atur kuota, jaga baterai",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "4 menit baca",
    image: "/assets/guides/pilih-kuota-traveling.jpg",
    imageAlt: "Traveler berbagi koneksi dari ponsel ke laptop di kafe",
    keywords: ["hotspot eSIM", "tethering eSIM", "berbagi internet saat traveling"],
    summary:
      "Berbagi hotspot dari eSIM tergantung ketentuan paket: sebagian mengizinkan, sebagian membatasi. Cek dulu aturannya, nyalakan hotspot di pengaturan, batasi perangkat yang tersambung, dan perhatikan bahwa hotspot memakai kuota dan baterai lebih cepat daripada pemakaian ponsel biasa.",
    paragraphs: [
      "Hotspot membuat ponselmu bertindak seperti router: laptop, tablet, atau ponsel teman memakai koneksi dari eSIM. Fitur ini berguna untuk bekerja jarak jauh atau saat satu orang di rombongan memiliki paket data sementara yang lain tidak. Namun ketersediaannya ditentukan oleh paket, bukan oleh ponsel saja.",
      "Sebelum membeli, baca ketentuan hotspot atau tethering pada paket. Sebagian paket mengizinkannya penuh, sebagian membatasi kecepatan, dan ada yang melarangnya. Jika kamu membutuhkan hotspot rutin, jadikan itu syarat saat membandingkan paket, bukan sesuatu yang dicek setelah tiba.",
      "Hotspot cenderung memakai kuota lebih cepat karena laptop dan tablet mengunduh pembaruan, sinkronisasi cloud, dan video dalam kualitas tinggi. Matikan pembaruan otomatis, tunda sinkronisasi besar, dan batasi jumlah perangkat yang tersambung. Pantau pemakaian dari pengaturan data seluler untuk melihat berapa kuota sudah terpakai.",
      "Hotspot juga menguras baterai ponsel. Bawa power bank, kurangi kecerahan layar, dan matikan hotspot saat tidak dipakai. Pasang kata sandi yang kuat pada hotspot agar orang lain tidak ikut menumpang, dan hindari menamai hotspot dengan informasi pribadi.",
    ],
    steps: [
      {
        title: "Baca ketentuan hotspot paket",
        body: "Pastikan paket mengizinkan hotspot dan cek apakah ada batas kecepatan atau kuota khusus.",
      },
      {
        title: "Nyalakan hotspot dengan kata sandi kuat",
        body: "Aktifkan di pengaturan ponsel, ganti nama jaringan netral, dan hindari kata sandi mudah ditebak.",
      },
      {
        title: "Batasi perangkat dan pembaruan",
        body: "Tunda pembaruan otomatis di laptop dan tablet, lalu pantau pemakaian data.",
      },
      {
        title: "Jaga baterai",
        body: "Bawa power bank dan matikan hotspot ketika tidak sedang dipakai.",
      },
    ],
    faqs: [
      {
        question: "Apakah semua eSIM mengizinkan hotspot?",
        answer:
          "Tidak. Ketentuan hotspot ditentukan paket. Baca detail paket sebelum membeli bila kamu membutuhkannya.",
      },
      {
        question: "Kenapa kuota cepat habis saat hotspot?",
        answer:
          "Laptop dan tablet sering mengunduh pembaruan dan sinkronisasi cloud secara otomatis, dan video dengan kualitas tinggi memakai banyak data. Matikan pembaruan otomatis dan pantau pemakaian.",
      },
      {
        question: "Apakah hotspot menguras baterai?",
        answer:
          "Ya, lebih cepat dari pemakaian biasa. Bawa power bank dan matikan hotspot saat tidak dipakai.",
      },
    ],
    sources: [APPLE_DATA, APPLE_TRAVEL],
    relatedDestinations: [
      { code: "jp", label: "Lihat paket eSIM Jepang" },
      { code: "asia", label: "Bandingkan paket Asia" },
    ],
    relatedLinks: [
      { guide: "cara-memilih-kuota-internet-saat-traveling", label: "Cara memilih kuota" },
    ],
  },
  {
    slug: "esim-untuk-liburan-keluarga-dan-grup",
    title: "eSIM untuk Liburan Keluarga dan Grup: Satu Paket atau Banyak?",
    description:
      "Cara memutuskan membeli eSIM per orang atau berbagi hotspot untuk keluarga dan grup, termasuk anak-anak, orang tua, dan perangkat yang berbeda.",
    eyebrow: "PANDUAN KELUARGA",
    heading: "Satu eSIM per ponsel atau berbagi satu paket? Tentukan dari rute dan perangkat",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "4 menit baca",
    image: "/assets/guides/itinerary-jepang-7-hari.jpg",
    imageAlt: "Keluarga merencanakan perjalanan bersama dan memeriksa koneksi internet",
    keywords: ["eSIM keluarga", "eSIM grup liburan", "internet liburan bersama keluarga"],
    summary:
      "Untuk keluarga atau grup, eSIM per ponsel paling andal jika semua perangkat kompatibel, karena setiap orang tetap terhubung saat berpisah. Hotspot dari satu ponsel lebih hemat jika rombongan selalu bersama dan paket mengizinkannya. Cek dulu ponsel anak dan orang tua.",
    paragraphs: [
      "Liburan bersama membuat pertanyaan koneksi menjadi lebih rumit: siapa yang butuh data sendiri, siapa yang cukup berbagi, dan bagaimana bila rombongan berpisah. Mulailah dari daftar ponsel setiap anggota, termasuk model dan apakah terkunci operator, karena tidak semua perangkat mendukung eSIM.",
      "Satu eSIM per ponsel lebih andal bila anggota sering berpisah, misalnya saat satu orang berbelanja sementara yang lain mengunjungi atraksi. Setiap orang memegang profil sendiri sehingga tidak bergantung pada ponsel orang lain. Konsekuensinya adalah biaya per paket dan pemasangan profil di setiap ponsel.",
      "Berbagi hotspot dari satu ponsel lebih hemat bila rombongan hampir selalu bersama dan paket mengizinkan hotspot. Risikonya, baterai ponsel pembawa cepat habis dan semua orang terputus bila ponsel itu mati atau terpisah. Bawa power bank dan tentukan siapa yang memegang ponsel pembawa.",
      "Untuk anak dan orang tua, siapkan sebelum berangkat: pasang profil lewat Wi-Fi, beri nama jelas pada profil, dan latih bagaimana menyalakan data seluler. Simpan nomor penting dan alamat penginapan secara offline. Bagi orang tua yang kurang terbiasa dengan pengaturan, pasang profil dan uji koneksi bersama-sama di rumah.",
    ],
    steps: [
      {
        title: "Daftar ponsel dan cek eSIM",
        body: "Catat model tiap ponsel dan pastikan mendukung eSIM serta tidak terkunci operator.",
      },
      {
        title: "Putuskan: per ponsel atau berbagi",
        body: "Pilih per ponsel jika sering berpisah, atau berbagi hotspot jika selalu bersama dan paket mengizinkan.",
      },
      {
        title: "Pasang dan uji di rumah",
        body: "Pasang profil lewat Wi-Fi dan pastikan setiap anggota paham cara menyalakan data seluler.",
      },
      {
        title: "Siapkan cadangan offline",
        body: "Simpan alamat, tiket, dan nomor penting tanpa koneksi, serta bawa power bank.",
      },
    ],
    faqs: [
      {
        question: "Apakah satu eSIM bisa dipakai beberapa ponsel?",
        answer:
          "Satu profil eSIM umumnya terikat pada satu ponsel. Untuk beberapa ponsel, beli profil per ponsel atau berbagi lewat hotspot bila paket mengizinkan.",
      },
      {
        question: "Bagaimana dengan anak-anak yang punya ponsel?",
        answer:
          "Periksa dukungan eSIM pada ponsel mereka. Jika tidak mendukung, berbagi hotspot dari ponsel orang tua adalah alternatif.",
      },
      {
        question: "Mana lebih hemat untuk grup besar?",
        answer:
          "Tergantung rute. Berbagi hotspot bisa lebih murah bila selalu bersama, tetapi eSIM per ponsel lebih andal saat grup terpisah.",
      },
    ],
    sources: [APPLE_TRAVEL, SAMSUNG_ESIM],
    relatedDestinations: [{ code: "jp", label: "Lihat paket eSIM Jepang" }],
    relatedLinks: [
      { guide: "cara-berbagi-hotspot-dari-esim-saat-traveling", label: "Cara berbagi hotspot" },
      { guide: "cara-cek-hp-kompatibel-esim", label: "Cek HP kompatibel eSIM" },
    ],
  },
  {
    slug: "kuota-esim-habis-saat-di-luar-negeri-apa-yang-dilakukan",
    title: "Kuota eSIM Habis di Luar Negeri? Ini yang Perlu Dilakukan",
    description:
      "Langkah saat kuota eSIM menipis atau habis saat traveling: cek pemakaian, hemat data, isi ulang bila tersedia, dan cadangan yang aman.",
    eyebrow: "PANDUAN KUOTA",
    heading: "Rencanakan cadangan sebelum kuota eSIM menipis",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "4 menit baca",
    image: "/assets/guides/waktu-aktivasi-esim.jpg",
    imageAlt: "Traveler memeriksa sisa kuota data eSIM di ponsel",
    keywords: ["kuota eSIM habis", "isi ulang eSIM", "top up eSIM", "tambah kuota saat traveling"],
    summary:
      "Saat kuota eSIM menipis, cek pemakaian di pengaturan ponsel atau aplikasi penyedia, kurangi pemakaian berat, lalu isi ulang atau beli paket baru bila tersedia. Jangan hapus profil lama sebelum yakin tidak dibutuhkan, dan siapkan peta serta tiket offline sebagai cadangan.",
    paragraphs: [
      "Kuota habis di tengah perjalanan biasanya terjadi pada hari yang paling butuh koneksi: saat mencari rute pulang atau menunjukkan tiket. Kuncinya adalah memantau pemakaian sebelum benar-benar habis. Cek data seluler di pengaturan ponsel atau aplikasi penyedia secara berkala, dan perlakukan angka pada ponsel sebagai indikator, bukan jaminan saldo tersisa.",
      "Jika kuota menipis, kurangi pemakaian berat: matikan pemutaran video otomatis, tunda pembaruan aplikasi, dan batasi hotspot. Pakai Wi-Fi hotel untuk mengunduh peta atau pembaruan besar. Prioritaskan aplikasi yang paling penting seperti peta, pesan, dan transportasi.",
      "Bila kuota sudah habis atau masa aktif berakhir, periksa apakah penyedia menawarkan isi ulang untuk profil yang sama, atau beli paket baru dengan profil terpisah. Ketentuan isi ulang berbeda antar paket, jadi baca detailnya sebelum perjalanan. Jangan menghapus profil lama sebelum yakin tidak membutuhkannya, karena profil yang sudah dihapus mungkin tidak dapat dipasang kembali.",
      "Cadangan paling aman adalah persiapan offline: peta yang sudah diunduh, alamat penginapan yang disimpan, dan tiket yang dapat dibuka tanpa internet. Sambungan Wi-Fi gratis di bandara atau hotel dapat menyelamatkan situasi darurat, tetapi jangan dipakai untuk transaksi sensitif. Untuk perjalanan berikutnya, gunakan catatan pemakaian kali ini sebagai dasar memilih kuota.",
    ],
    steps: [
      {
        title: "Pantau pemakaian harian",
        body: "Lihat data seluler di pengaturan ponsel atau aplikasi penyedia dan catat pemakaian tiap hari.",
      },
      {
        title: "Kurangi pemakaian berat",
        body: "Matikan video otomatis, tunda pembaruan, dan batasi hotspot saat kuota menipis.",
      },
      {
        title: "Isi ulang atau beli paket baru",
        body: "Periksa opsi isi ulang pada paket, atau pasang paket baru bila perlu, tanpa menghapus profil lama.",
      },
      {
        title: "Siapkan cadangan offline",
        body: "Unduh peta, simpan alamat, dan tangkapan layar tiket agar tetap terbuka tanpa koneksi.",
      },
    ],
    faqs: [
      {
        question: "Bisakah eSIM diisi ulang saat kuota habis?",
        answer:
          "Tergantung paket dan penyedia. Baca ketentuan isi ulang pada detail paket sebelum perjalanan.",
      },
      {
        question: "Apakah boleh menghapus profil eSIM yang sudah habis?",
        answer:
          "Tunggu sampai kamu yakin tidak membutuhkannya. Profil yang dihapus mungkin tidak bisa dipasang ulang, sehingga isi ulang menjadi tidak mungkin.",
      },
      {
        question: "Bagaimana agar kuota tidak habis cepat?",
        answer:
          "Unduh peta dan dokumen lewat Wi-Fi, matikan video otomatis, tunda pembaruan aplikasi, dan batasi hotspot.",
      },
    ],
    sources: [APPLE_DATA, APPLE_TRAVEL],
    relatedDestinations: [
      { code: "jp", label: "Lihat paket eSIM Jepang" },
      { code: "asia", label: "Bandingkan paket Asia" },
    ],
    relatedLinks: [
      { guide: "cara-memilih-kuota-internet-saat-traveling", label: "Cara memilih kuota" },
      { guide: "esim-tidak-ada-sinyal-cara-mengatasi", label: "eSIM tidak ada sinyal" },
    ],
  },
];
