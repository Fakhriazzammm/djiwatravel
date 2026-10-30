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
      "Cara membandingkan paket eSIM Jepang berdasarkan rute, kebiasaan internet, masa aktif, dan aturan aktivasi sebelum berangkat.",
    eyebrow: "PANDUAN JEPANG",
    heading: "Pilih eSIM Jepang berdasarkan rute dan kebiasaan internetmu",
    publishedAt: "2026-10-15",
    updatedAt: "2026-10-31",
    readTime: "3 menit baca",
    image: "/assets/guides/esim-jepang-kuota.jpg",
    imageAlt: "Traveler merencanakan penggunaan eSIM untuk perjalanan di Jepang",
    paragraphs: [
      "Tidak ada satu paket eSIM Jepang yang paling cocok untuk semua perjalanan. Rute beberapa hari di Tokyo dengan Wi-Fi hotel akan berbeda kebutuhannya dari perjalanan panjang yang berpindah kota, sering membuka peta, menerjemahkan informasi, mengunggah foto, atau berbagi koneksi ke laptop. Mulailah dari rencana perjalanan dan kebiasaanmu sendiri, bukan dari label “paket terbaik” atau kuota terbesar.",
      "Buat daftar aktivitas yang kemungkinan memakai data seluler: mencari rute dan jam operasional, memesan kendaraan, mengirim pesan, membuka media sosial, menonton video, atau menggunakan hotspot. Video, unggahan otomatis, dan hotspot dapat menghabiskan kuota lebih cepat daripada pesan teks. Jika ponselmu menampilkan pemakaian data per aplikasi, gunakan riwayat perjalanan serupa sebagai patokan; angka pemakaian akan berbeda menurut aplikasi, kualitas media, dan setelan otomatis.",
      "Saat membandingkan paket, samakan dulu tiga hal: negara yang dicakup, jumlah hari, dan kuota berkecepatan penuh. Setelah itu periksa apakah ada batas pemakaian wajar, penurunan kecepatan setelah kuota tertentu, larangan hotspot, atau pilihan isi ulang. Dua paket dengan kuota yang tertulis sama belum tentu memberi pengalaman yang sama jika ketentuan kecepatannya berbeda.",
      "Pastikan masa aktif sesuai dengan tanggal penggunaan yang tertulis pada paket. Ada paket yang mulai dihitung saat profil dipasang, ada yang baru mulai ketika tersambung ke jaringan tujuan, dan ada pula ketentuan lain. Jangan menyimpulkan aturan aktivasi dari paket eSIM lain. Baca detail produk sebelum membeli, terutama bila kamu akan transit atau tiba larut malam.",
      "Sebelum terbang, unduh peta area yang akan dikunjungi, simpan alamat penginapan dan tiket agar bisa dibuka tanpa koneksi, lalu pasang eSIM hanya pada waktu yang diizinkan petunjuk paket. Peta offline punya batas fitur: Google Maps, misalnya, tidak menyediakan petunjuk arah transportasi umum, berjalan kaki, atau bersepeda saat offline. Simpan rute penting ketika masih online dan cek fitur aplikasi peta yang kamu pakai. Periksa pengaturan roaming SIM utama agar tidak terkena biaya yang tidak direncanakan.",
    ],
    steps: [
      {
        title: "Petakan aktivitas yang perlu internet",
        body: "Tandai kapan kamu memakai peta, pesan, media sosial, video, dan hotspot. Pisahkan aktivitas penting dari hiburan yang bisa dilakukan melalui Wi-Fi.",
      },
      {
        title: "Cocokkan cakupan dan masa aktif",
        body: "Pastikan paket mencakup Jepang dan aktif selama hari yang kamu perlukan. Periksa kapan masa aktif mulai dihitung, termasuk jika ada transit atau kedatangan larut.",
      },
      {
        title: "Bandingkan ketentuan, bukan kuota saja",
        body: "Periksa batas kecepatan, hotspot, isi ulang, dan apakah paket hanya menyediakan data. Syarat ini menentukan apakah paket sesuai dengan cara kamu bepergian.",
      },
      {
        title: "Siapkan ponsel sebelum terbang",
        body: "Pastikan perangkat kompatibel dan tidak terkunci operator. Baca petunjuk pemasangan paket, unduh peta offline, lalu ikuti waktu aktivasi yang ditetapkan penyedia.",
      },
    ],
    sources: [
      {
        label: "Apple: menggunakan eSIM saat bepergian internasional",
        url: "https://support.apple.com/en-us/118227",
      },
      {
        label: "Google Maps: mengunduh peta dan batas penggunaan offline",
        url: "https://support.google.com/maps/answer/6291838?co=GENIE.Platform%3DiOS&hl=en",
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
      "Persiapan eSIM dan internet untuk umrah: cek perangkat, koordinasi rombongan, simpan informasi penting, dan pahami aktivasi paket.",
    eyebrow: "PANDUAN UMRAH",
    heading: "Siapkan koneksi untuk perjalanan umrah dari bandara hingga hotel",
    publishedAt: "2026-10-15",
    updatedAt: "2026-10-31",
    readTime: "3 menit baca",
    image: "/assets/guides/esim-umrah-arab-saudi.jpg",
    imageAlt: "Jemaah umrah memeriksa ponsel bersama rombongan di area Masjidil Haram",
    paragraphs: [
      "Saat umrah, ponsel sering dipakai untuk membuka alamat hotel, mencari rute, menghubungi keluarga, dan berkoordinasi dengan rombongan. Koneksi data dapat membantu ketika Wi-Fi belum tersedia, tetapi jangan jadikan internet sebagai satu-satunya tempat menyimpan informasi penting. Simpan alamat hotel, nomor pembimbing, titik temu, dan tiket agar tetap bisa dibuka saat koneksi internet tidak tersedia. Untuk keadaan darurat, catat nomor dan alamat penting di kertas atau berikan salinannya kepada pendamping, karena ponsel yang mati tidak dapat membuka dokumen digital.",
      "Mulai dengan memastikan ponsel mendukung eSIM pada varian model yang kamu miliki dan tidak terkunci ke operator tertentu. Cek juga apakah paket yang dipilih mencakup Arab Saudi, berapa lama masa aktifnya, kapan hitungan dimulai, dan apakah kuotanya hanya untuk data. Nama model saja belum cukup untuk memastikan kompatibilitas; cocokkan nomor model dengan informasi resmi produsen dan petunjuk paket.",
      "Rencanakan penggunaan untuk fase perjalanan yang berbeda: keluar dari bandara, menuju penginapan, berpindah antara lokasi, dan kembali ke bandara. Catat titik temu yang mudah dijelaskan kepada anggota rombongan. Unduh peta area dan simpan alamat serta petunjuk penting sebelum berangkat. Fitur offline bergantung pada aplikasi; Google Maps tidak memberi petunjuk arah transportasi umum atau berjalan kaki saat offline. Jangan jadikan peta offline sebagai satu-satunya cara mencari rute rombongan.",
      "Jika ingin tetap menerima panggilan atau SMS pada nomor Indonesia, tanyakan kepada operator mengenai biaya dan pengaturan roaming sebelum berangkat. Paket eSIM perjalanan dapat menjadi jalur data tambahan, tetapi tidak otomatis menyediakan nomor telepon atau SMS biasa. Periksa pengaturan SIM utama dan jalur data pada ponsel agar layanan tidak berpindah ke SIM yang menimbulkan biaya di luar rencana.",
      "Sebelum membeli, bandingkan cakupan, kuota, masa aktif, batas kecepatan, kebijakan hotspot, serta cara menghubungi bantuan jika pemasangan gagal. Simpan bukti pembelian dan instruksi aktivasi di tempat yang aman. Jangan mengirim kode QR aktivasi ke grup umum, karena kode itu dapat memberi akses untuk memasang profil eSIM.",
    ],
    steps: [
      {
        title: "Simpan informasi yang tidak boleh hilang",
        body: "Catat nomor pembimbing, kontak darurat, alamat penginapan, dan titik temu secara offline. Pastikan anggota keluarga tahu cara menghubungi rombongan bila ada perubahan rencana.",
      },
      {
        title: "Tentukan peran SIM utama dan eSIM",
        body: "Pilih jalur data yang akan digunakan dan periksa tarif roaming SIM Indonesia. Jika ingin menerima panggilan atau SMS di nomor utama, pastikan operator dan perangkat mendukung pengaturan yang kamu perlukan.",
      },
      {
        title: "Siapkan peta dan dokumen offline",
        body: "Unduh peta area perjalanan dan simpan tiket, alamat, serta jadwal sebelum meninggalkan Wi-Fi. Peta offline membantu untuk area yang sudah diunduh, tetapi tidak menggantikan layanan daring.",
      },
      {
        title: "Pastikan paket sesuai rute dan tanggal",
        body: "Periksa Arab Saudi tercantum dalam cakupan, masa aktif meliputi seluruh perjalanan, dan pahami kapan masa aktif dimulai serta batas kecepatan atau hotspot.",
      },
    ],
    sources: [
      {
        label: "Apple: menggunakan eSIM saat bepergian internasional",
        url: "https://support.apple.com/en-us/118227",
      },
      {
        label: "Google Maps: mengunduh peta dan batas penggunaan offline",
        url: "https://support.google.com/maps/answer/6291838?co=GENIE.Platform%3DiOS&hl=en",
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
      "Cara memilih paket data untuk rute Singapura–Malaysia, memeriksa cakupan lintas negara, dan menyiapkan koneksi sebelum berangkat.",
    eyebrow: "PANDUAN ASIA",
    heading: "Pastikan paket internet mengikuti rute Singapura dan Malaysia",
    publishedAt: "2026-10-15",
    updatedAt: "2026-10-31",
    readTime: "3 menit baca",
    image: "/assets/guides/internet-singapura-malaysia.jpg",
    imageAlt:
      "Traveler melintasi Singapura dan Malaysia dengan kereta sambil memeriksa peta di ponsel",
    paragraphs: [
      "Rute Singapura–Malaysia bisa berarti beberapa hari di satu negara, perjalanan darat lintas perbatasan, atau transit singkat sebelum melanjutkan perjalanan. Sebelum membeli eSIM, tulis negara yang benar-benar akan dikunjungi dan tanggal kamu perlu memakai data. Jangan menganggap paket yang menyebut “Asia” otomatis mencakup setiap negara dalam itinerary; buka daftar cakupan dan pastikan Singapura serta Malaysia sama-sama tercantum.",
      "Bandingkan paket negara tunggal dengan paket regional menggunakan masa aktif, kuota, dan harga yang sebanding. Paket regional hanya praktis jika negara yang dicakup cocok dengan rute dan aturan aktivasinya sesuai. Periksa apakah masa aktif berjalan terus saat berpindah negara, apakah paket perlu memilih jaringan secara manual, dan apakah ada batas hotspot atau penurunan kecepatan.",
      "Pikirkan kapan kamu paling membutuhkan koneksi: mencari transportasi setelah tiba, membuka alamat penginapan, menggunakan peta ketika berpindah area, atau menghubungi keluarga. Simpan tiket, alamat, dan area peta secara offline sebelum perjalanan. Untuk Google Maps, rute transportasi umum dan berjalan kaki tidak tersedia saat offline, jadi simpan petunjuk penting ketika masih tersambung. Pembayaran atau pemesanan daring tetap membutuhkan koneksi, jadi siapkan metode cadangan dan jangan hanya mengandalkan Wi-Fi umum.",
      "Saat menyeberang perbatasan, ikuti petunjuk paket dan perhatikan indikator jaringan serta jalur data yang aktif. Perpindahan jaringan dapat memerlukan waktu atau pengaturan tambahan, dan prosesnya bergantung pada perangkat serta penyedia. Jika layanan tidak tersambung, gunakan panduan resmi paket sebelum menghapus profil atau memasang ulang eSIM.",
      "Bila kamu perlu mempertahankan nomor Indonesia untuk panggilan atau SMS, tanyakan biaya roaming kepada operator. Banyak paket eSIM perjalanan berfokus pada data dan tidak menyertakan nomor lokal; pastikan fitur panggilan, SMS, dan hotspot yang kamu butuhkan memang tersedia sebelum membayar.",
    ],
    steps: [
      {
        title: "Cocokkan daftar negara dengan itinerary",
        body: "Pastikan Singapura dan Malaysia benar-benar tercantum pada cakupan paket. Jangan menyimpulkan cakupan dari nama paket atau kawasan pemasarannya saja.",
      },
      {
        title: "Bandingkan paket dengan syarat yang sama",
        body: "Samakan hari penggunaan dan kuota, lalu periksa kecepatan, hotspot, cara isi ulang, dan kapan masa aktif mulai dihitung.",
      },
      {
        title: "Siapkan informasi untuk kondisi offline",
        body: "Unduh peta jika tersedia, simpan tiket dan alamat, lalu pastikan ponsel mendukung eSIM serta tidak terkunci operator sebelum berangkat.",
      },
      {
        title: "Rencanakan perpindahan jaringan",
        body: "Ikuti langkah penyedia saat tiba di negara berikutnya. Periksa jalur data dan status koneksi, lalu hubungi bantuan paket jika perlu konfigurasi tambahan.",
      },
    ],
    sources: [
      {
        label: "Apple: menggunakan eSIM saat bepergian internasional",
        url: "https://support.apple.com/en-us/118227",
      },
      {
        label: "Google Maps: mengunduh peta dan batas penggunaan offline",
        url: "https://support.google.com/maps/answer/6291838?co=GENIE.Platform%3DiOS&hl=en",
      },
    ],
    relatedDestinations: [
      { code: "sg", label: "Lihat paket eSIM Singapura" },
      { code: "my", label: "Lihat paket eSIM Malaysia" },
    ],
  },
  {
    slug: "cara-memasang-esim-sebelum-berangkat",
    title: "Cara Memasang eSIM Sebelum Berangkat",
    description:
      "Panduan memasang eSIM perjalanan dengan aman: cek ponsel, siapkan Wi-Fi, pahami QR, dan ikuti instruksi aktivasi paket.",
    eyebrow: "PANDUAN eSIM",
    heading: "Pasang eSIM perjalanan tanpa kehilangan akses ke SIM utama",
    publishedAt: "2026-10-30",
    updatedAt: "2026-10-31",
    readTime: "3 menit baca",
    image: "/assets/guides/pasang-esim-perjalanan.jpg",
    imageAlt: "Traveler memasang eSIM di ponsel saat menunggu keberangkatan di bandara",
    paragraphs: [
      "Sebelum memasang, siapkan ponsel yang mendukung eSIM, koneksi Wi-Fi yang stabil, dan instruksi dari penyedia paket. Cocokkan nomor model lengkap dengan panduan produsen dan pastikan perangkat tidak terkunci operator. Menu dapat berbeda menurut model, wilayah penjualan, dan versi sistem, jadi gunakan langkah berikut sebagai orientasi lalu ikuti layar ponsel serta petunjuk paketmu.",
      "Di iPhone, buka Pengaturan > Seluler, pilih Atur Seluler atau Tambah eSIM, lalu pilih Gunakan Kode QR jika penyedia memberikan QR. Ikuti instruksi di layar sampai profil ditambahkan. Pada beberapa versi iOS, kamera juga dapat membaca QR dari penyedia; jika instruksi paket meminta cara lain seperti aplikasi atau aktivasi operator, ikuti metode tersebut.",
      "Di Samsung Galaxy yang mendukung eSIM, buka Pengaturan > Koneksi > Manajer SIM > Tambah eSIM, lalu pindai QR dari penyedia atau masukkan kode aktivasi bila opsi itu tersedia. Samsung menjelaskan bahwa paket tertentu juga dapat diunduh lewat pengaturan sederhana, tetapi dukungannya bergantung pada perangkat dan operator. Pada Android merek lain, cari panduan resmi untuk modelmu.",
      "Setelah profil ditambahkan, beri nama jalur eSIM agar mudah dibedakan dari SIM utama dan pastikan profil terlihat pada daftar SIM. Jika paket mengizinkan pemasangan sebelum perjalanan, kamu dapat menyelesaikan langkah instalasi saat masih tersambung ke Wi-Fi. Untuk menentukan kapan paket mulai berlaku dan kapan jalur data perlu dipilih, ikuti detail paket—kedua hal itu tidak sama untuk semua penyedia.",
      "Jika QR tidak terbaca, periksa apakah layar kode cukup terang dan kamera fokus; jangan bagikan gambar QR ke ruang publik. Bila QR hanya dapat dipasang sekali atau kode tidak berfungsi, jangan menghapus profil lalu mencoba ulang sendiri. Minta langkah berikutnya kepada penyedia dengan menyertakan nomor pesanan dan jenis ponsel. Jangan kirim IMEI, EID, atau kode aktivasi kecuali dukungan resmi memerlukannya melalui kanal yang sesuai.",
    ],
    steps: [
      {
        title: "Cek kompatibilitas model dan kunci operator",
        body: "Cari nomor model lengkap di pengaturan ponsel dan cocokkan dengan panduan produsen. Pastikan operator tidak membatasi penggunaan jaringan lain.",
      },
      {
        title: "Siapkan koneksi dan instruksi",
        body: "Gunakan Wi-Fi stabil dan pastikan paket menyediakan langkah pemasangan untuk model ponselmu. Siapkan bukti pembelian sebelum memulai.",
      },
      {
        title: "Ikuti alur pada perangkat",
        body: "iPhone: Pengaturan > Seluler > Atur Seluler atau Tambah eSIM > Gunakan Kode QR. Galaxy: Pengaturan > Koneksi > Manajer SIM > Tambah eSIM. Nama menu dapat berbeda menurut model dan versi.",
      },
      {
        title: "Pastikan profil terpasang dan beri label",
        body: "Periksa daftar SIM untuk memastikan profil sudah muncul, lalu beri nama yang mudah dikenali. Tentukan kapan paket mulai aktif dan jalur data yang dipakai dengan mengikuti petunjuk produk.",
      },
      {
        title: "Minta bantuan dengan aman",
        body: "Jaga QR dan kode aktivasi agar tidak tersebar. Jika pemasangan gagal, simpan pesan kesalahan dan hubungi dukungan resmi sebelum menghapus profil atau mencoba ulang.",
      },
    ],
    sources: [
      { label: "Apple: mengatur eSIM di iPhone", url: "https://support.apple.com/en-us/118669" },
      {
        label: "Apple: menggunakan eSIM saat bepergian internasional",
        url: "https://support.apple.com/en-us/118227",
      },
      {
        label: "Samsung: Galaxy eSIM dan perangkat yang didukung",
        url: "https://www.samsung.com/sg/support/mobile-devices/galaxy-esim-and-supported-network-carriers/",
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
      "Cara memperkirakan kebutuhan kuota eSIM dari pola aplikasi, hotspot, lama perjalanan, dan akses Wi-Fi tanpa menebak angka.",
    eyebrow: "PANDUAN KUOTA",
    heading: "Perkirakan kuota dari cara kamu memakai ponsel saat bepergian",
    publishedAt: "2026-10-30",
    updatedAt: "2026-10-31",
    readTime: "3 menit baca",
    image: "/assets/guides/pilih-kuota-traveling.jpg",
    imageAlt: "Traveler memperkirakan kebutuhan kuota sambil merencanakan rute perjalanan",
    paragraphs: [
      "Kuota yang terasa cukup bagi satu orang bisa cepat habis bagi orang lain. Membuka peta dan mengirim pesan tidak sama dengan menonton video, mengunggah banyak foto, melakukan panggilan video, atau membagikan hotspot ke perangkat lain. Karena pemakaian tiap aplikasi dan kualitas media berbeda-beda, hindari memakai angka kebutuhan orang lain sebagai patokan pasti.",
      "Mulailah dengan mengingat perjalanan terakhir yang durasi dan kebiasaan internetnya mirip. Periksa pemakaian data per aplikasi di pengaturan ponsel jika tersedia, lalu tentukan aplikasi mana yang akan memakai data seluler saat bepergian. Jika belum punya catatan perjalanan, ukur satu hari yang mewakili kebiasaanmu: catat angka awal, gunakan ponsel seperti biasa, lalu catat lagi setelah sehari dan hitung selisihnya. Di iPhone, statistik penggunaan dihitung sejak terakhir direset; lihat Pengaturan > Seluler dan pastikan jalur data yang dipilih sesuai. Nama menu pada ponsel lain bisa berbeda.",
      "Gunakan hitungan sederhana: pemakaian harian terukur × jumlah hari perjalanan = perkiraan dasar. Contoh ilustrasi, bukan patokan umum: jika selisih catatan menunjukkan 0,8 GB untuk satu hari yang mewakili perjalanan, tujuh hari menghasilkan perkiraan dasar 5,6 GB. Sesuaikan hitungan bila tujuan punya lebih banyak penggunaan peta, video, unggahan, panggilan video, atau hotspot daripada hari pengukuran. Setelah itu pilih paket yang memenuhi perkiraan dan cek batas kecepatan serta aturan pemakaian wajarnya.",
      "Kurangi kebutuhan yang tidak perlu sebelum berangkat. Unduh peta dan dokumen melalui Wi-Fi, matikan pemutaran video otomatis bila tersedia, dan tunda pembaruan aplikasi atau pencadangan foto sampai tersambung ke Wi-Fi. Persiapan offline membantu menghemat kuota, tetapi jangan menganggap semua fitur navigasi, pencarian, atau pembayaran akan berfungsi tanpa koneksi.",
      "Setelah memperkirakan pola pemakaian, cocokkan dengan isi paket: jumlah kuota, masa aktif, negara cakupan, batas kecepatan, kebijakan pemakaian wajar, dan dukungan hotspot. Cek pula apakah penyedia menawarkan isi ulang sebelum kuota habis. Paket bertuliskan “unlimited” tetap perlu dibaca ketentuannya agar kamu tahu apakah kecepatan atau penggunaan hotspot dibatasi.",
      "Saat perjalanan berlangsung, lihat pemakaian di pengaturan ponsel atau aplikasi penyedia jika tersedia. Angka pada perangkat mungkin tidak sama persis dengan pencatatan operator; gunakan sebagai indikator untuk mengatur kebiasaan, bukan sebagai jaminan saldo tersisa. Jika kuota mulai menipis, hentikan unduhan besar, gunakan Wi-Fi tepercaya bila ada, dan periksa pilihan isi ulang resmi.",
    ],
    steps: [
      {
        title: "Gunakan perjalanan serupa sebagai patokan",
        body: "Cek perjalanan serupa atau ukur satu hari: catat angka pemakaian awal dan akhir, lalu hitung selisihnya pada jalur data yang sama.",
      },
      {
        title: "Pisahkan kebutuhan penting dan aktivitas berat",
        body: "Peta, pesan, video, unggahan otomatis, panggilan video, dan hotspot memakai kuota dengan pola berbeda. Unduh peta dan dokumen melalui Wi-Fi sebelum berangkat.",
      },
      {
        title: "Cocokkan paket dan siapkan pengendalian",
        body: "Bandingkan kuota, masa aktif, negara, batas kecepatan, hotspot, dan isi ulang. Pantau penggunaan selama trip dan tunda unduhan besar saat memakai data seluler.",
      },
      {
        title: "Pahami batas estimasi",
        body: "Pemakaian berbeda menurut aplikasi, kualitas video, dan sinkronisasi latar belakang. Periksa statistik perangkat secara berkala dan gunakan angka itu sebagai panduan, bukan kepastian.",
      },
    ],
    sources: [
      {
        label: "Apple: melihat dan mengatur penggunaan data seluler",
        url: "https://support.apple.com/en-us/109323",
      },
      {
        label: "Google Maps: mengunduh peta dan batas penggunaan offline",
        url: "https://support.google.com/maps/answer/6291838?co=GENIE.Platform%3DiOS&hl=en",
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
      "Langkah memeriksa eSIM pada model ponsel yang tepat, status kunci operator, dan syarat paket sebelum membeli.",
    eyebrow: "PANDUAN PERANGKAT",
    heading: "Cek model ponsel dan kunci operator sebelum membeli eSIM",
    publishedAt: "2026-10-30",
    updatedAt: "2026-10-31",
    readTime: "3 menit baca",
    image: "/assets/guides/cek-kompatibilitas-esim.jpg",
    imageAlt: "Traveler memeriksa ikon eSIM dan tanda kompatibilitas pada ponsel di bandara",
    paragraphs: [
      "Jangan hanya mengandalkan nama keluarga perangkat seperti “iPhone”, “Galaxy”, atau nomor seri. Dukungan eSIM bisa berbeda menurut nomor model, wilayah tempat perangkat dijual, perangkat lunak, dan operator. Sebelum membayar, temukan nomor model lengkap pada menu informasi perangkat lalu cocokkan dengan daftar dukungan resmi produsen dan syarat eSIM yang akan dibeli.",
      "Periksa juga apakah perangkat terkunci ke operator. Pada iPhone, Apple mengarahkan pengguna ke Pengaturan > Umum > Mengenai, lalu melihat bagian Kunci Operator; keterangan “Tidak ada pembatasan SIM” berarti perangkat tidak terkunci. Nama dan letak menu dapat berubah menurut versi sistem operasi. Untuk perangkat Android, gunakan panduan resmi produsen bagi model dan wilayahmu, lalu konfirmasikan kepada operator jika status kunci tidak terlihat jelas.",
      "Kompatibilitas perangkat saja belum memastikan paket akan berfungsi. Cocokkan negara tujuan, cakupan paket, masa aktif, jenis layanan (data saja atau juga panggilan/SMS), ketentuan hotspot, serta instruksi aktivasi. Jika perjalanan melintasi beberapa negara, pastikan semuanya ada dalam daftar cakupan paket. Jangan menyamakan dukungan eSIM dengan dukungan setiap jaringan atau paket tertentu.",
      "Bila masih ragu, hubungi produsen atau operator sebelum membeli dan tanyakan menggunakan nomor model yang tepat. Jangan mengirim IMEI atau EID pada komentar publik, grup, atau percakapan yang tidak resmi. Informasi identitas perangkat hanya perlu diberikan jika dukungan resmi memintanya melalui saluran yang sesuai.",
      "Sebelum berangkat, pastikan ponsel dapat terhubung ke Wi-Fi dan ikuti instruksi pemasangan penyedia. Simpan akses ke bukti pembelian serta cara menghubungi bantuan di tempat yang berbeda dari kode QR. Dengan begitu, kamu masih dapat menemukan petunjuk jika proses pemasangan memerlukan bantuan.",
    ],
    steps: [
      {
        title: "Catat nomor model lengkap",
        body: "Buka informasi perangkat dan salin model lengkapnya. Nama seri saja belum cukup karena dukungan bisa berbeda antarvarian dan wilayah penjualan.",
      },
      {
        title: "Konfirmasi eSIM dan status kunci",
        body: "Ikuti panduan produsen untuk mengecek eSIM dan pastikan operator tidak membatasi penggunaan jaringan lain. Hubungi operator jika statusnya tidak jelas.",
      },
      {
        title: "Cocokkan syarat paket dengan rute",
        body: "Pastikan semua negara tujuan tercakup, pahami kuota dan masa aktif, lalu cek jenis layanan, hotspot, dan aktivasi. Tanyakan melalui dukungan resmi bila belum yakin.",
      },
    ],
    sources: [
      {
        label: "Apple: menggunakan eSIM saat bepergian internasional",
        url: "https://support.apple.com/en-us/118227",
      },
      { label: "Apple: mengatur eSIM di iPhone", url: "https://support.apple.com/en-us/118669" },
      {
        label: "Samsung: eSIM dan perangkat Galaxy yang didukung",
        url: "https://www.samsung.com/sg/support/mobile-devices/galaxy-esim-and-supported-network-carriers/",
      },
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
      "Perbandingan eSIM perjalanan dan roaming operator untuk memilih cara internet yang sesuai dengan nomor utama, rute, dan biaya.",
    eyebrow: "PANDUAN KONEKSI",
    heading: "Bandingkan eSIM dan roaming sebelum berangkat ke luar negeri",
    publishedAt: "2026-10-30",
    updatedAt: "2026-10-31",
    readTime: "3 menit baca",
    image: "/assets/guides/esim-vs-roaming.jpg",
    imageAlt: "Traveler membandingkan simbol eSIM dan jaringan roaming pada ponsel di bandara",
    paragraphs: [
      "Roaming dan eSIM perjalanan sama-sama dapat memberi akses seluler saat kamu berada di luar negeri, tetapi cara kerja dan tagihannya berbeda. Roaming memakai layanan operator nomor utamamu di jaringan mitra. eSIM perjalanan menambahkan profil dari penyedia lain; banyak paketnya berfokus pada data dan tidak otomatis menyediakan nomor untuk panggilan atau SMS biasa.",
      "Roaming mungkin paling sederhana jika paket operator rumahmu sudah mencakup negara tujuan, masa berlaku, dan pemakaian yang kamu perlukan. Sebelum berangkat, periksa batas kuota, biaya jika jatah habis, tarif panggilan dan SMS, serta apakah layanan aktif otomatis. Jangan berasumsi bahwa paket domestik mencakup roaming internasional.",
      "eSIM perjalanan dapat cocok jika kamu ingin membandingkan paket data khusus tujuan atau kawasan. Periksa cakupan setiap negara, jumlah kuota, masa aktif, batas kecepatan, hotspot, isi ulang, dan pemicu aktivasi. Jika ingin memakai nomor Indonesia untuk OTP, panggilan, atau SMS, pastikan operator dan ponsel mendukung pengaturan yang dibutuhkan serta pahami biaya yang mungkin berlaku.",
      "Agar perbandingannya adil, hitung biaya untuk durasi dan jumlah data yang sebanding. Perhatikan pula biaya tambahan, pajak, kebijakan penggunaan wajar, dan apa yang terjadi setelah kuota habis. Jika kamu akan bekerja dari laptop, pastikan hotspot diperbolehkan. Jika hanya memerlukan pesan, peta, dan pemesanan, lihat apakah paket data saja sudah mencukupi.",
      "Kedua pilihan membutuhkan ponsel dan setelan yang sesuai. Perangkat harus mendukung eSIM dan tidak terkunci untuk memakai penyedia lain. Kamu dapat mempertahankan profil SIM utama, tetapi tentukan jalur data yang aktif dan atur data roaming dengan hati-hati. Pada iPhone, pengaturan serta statistik penggunaan tersedia di bagian Seluler; menu berbeda di perangkat lain. Unduh peta dan dokumen melalui Wi-Fi sebagai cadangan.",
    ],
    steps: [
      {
        title: "Tentukan kebutuhan nomor dan pesan",
        body: "Jika nomor Indonesia dibutuhkan untuk OTP, telepon, atau SMS, cek tarif roaming dan kemampuan ponsel. Pastikan apakah eSIM perjalanan hanya menyediakan data.",
      },
      {
        title: "Bandingkan harga pada durasi yang sama",
        body: "Samakan negara, hari penggunaan, dan kuota. Periksa juga pajak, batas kecepatan, hotspot, isi ulang, biaya di luar paket, serta masa aktif.",
      },
      {
        title: "Cek aktivasi dan pengaturan ponsel",
        body: "Pastikan ponsel kompatibel dan tidak terkunci. Pahami pemicu masa aktif, pilih jalur data yang benar, dan atur roaming SIM utama sesuai tarif operator.",
      },
      {
        title: "Siapkan akses tanpa internet",
        body: "Simpan tiket, alamat, dan peta offline sebelum berangkat. Ini membantu saat koneksi belum tersambung, tetapi tidak menggantikan layanan daring.",
      },
    ],
    sources: [
      {
        label: "Apple: menggunakan eSIM saat bepergian internasional",
        url: "https://support.apple.com/en-us/118227",
      },
      {
        label: "Apple: melihat dan mengatur penggunaan data seluler",
        url: "https://support.apple.com/en-us/109323",
      },
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
      "Ketahui kapan memasang profil eSIM dan kapan masa aktif paket dimulai agar koneksi siap tanpa menghabiskan masa berlaku terlalu awal.",
    eyebrow: "PANDUAN AKTIVASI",
    heading: "Tentukan waktu memasang eSIM dari aturan paket, bukan tebakan",
    publishedAt: "2026-10-30",
    updatedAt: "2026-10-31",
    readTime: "3 menit baca",
    image: "/assets/guides/waktu-aktivasi-esim.jpg",
    imageAlt:
      "Traveler memasang eSIM pada malam sebelum keberangkatan dengan koper yang sudah disiapkan",
    paragraphs: [
      "Pemasangan profil eSIM belum tentu langsung memulai masa aktif. Setiap paket punya aturan sendiri: hitungan dapat dimulai saat profil dipasang, ketika perangkat pertama kali terhubung ke jaringan tujuan, atau pada kondisi lain yang disebutkan penyedia. Perbedaan ini penting karena menentukan kapan kamu perlu memasang profil dan berapa lama paket tersedia untuk perjalanan.",
      "Sebelum membeli atau memindai QR, cari kalimat yang menjelaskan “validity”, “activation”, atau masa berlaku pada halaman produk dan instruksi pesanan. Catat peristiwa yang memulai hitungan hari, apakah profil boleh dipasang lebih awal, dan apakah ada tenggat setelah profil diunduh. Jika aturan hanya menyebut “aktif setelah instalasi” atau tidak jelas, tanyakan ke penyedia kapan sebaiknya memasang paket berdasarkan tanggal perjalananmu.",
      "Gunakan aturan itu untuk memilih waktu. Bila hitungan dimulai saat pemasangan, jangan memasang jauh sebelum perjalanan kecuali penyedia menyatakan periode tunggunya cukup. Bila paket memperbolehkan pemasangan awal dan masa aktif menunggu sambungan ke jaringan tujuan, kamu bisa menyiapkan profil lebih awal di tempat dengan Wi-Fi stabil. Tetap ikuti ketentuan tertulis karena istilah dan proses berbeda antarproduk.",
      "Sebelum berangkat, simpan jadwal penerbangan, bukti pembelian, petunjuk aktivasi, dan cara menghubungi bantuan. Sesampainya di tujuan, ikuti instruksi paket untuk memilih jalur data dan menyalakan layanan. Jika penerbangan berubah atau kamu transit lebih lama dari rencana, jangan menebak dampaknya pada masa aktif; tanyakan kepada penyedia apakah aturan paket berubah karena waktu kedatangan.",
      "Jika profil sudah dipasang tetapi layanan belum dimulai, periksa apakah perangkat sudah berada di negara cakupan dan apakah syarat pemicu paket terpenuhi. Bila tetap gagal, simpan pesan kesalahan dan hubungi dukungan. Jangan menghapus profil atau memindai ulang QR sebelum mendapat arahan, sebab sebagian kode aktivasi tidak dapat digunakan berulang.",
    ],
    steps: [
      {
        title: "Temukan aturan mulai masa berlaku",
        body: "Cari keterangan validity atau activation pada halaman paket dan instruksi pesanan. Catat peristiwa yang memulai hitungan hari serta batas waktu pemasangan awal.",
      },
      {
        title: "Cocokkan aturan dengan tanggal perjalanan",
        body: "Jika masa aktif mulai saat pemasangan, jangan memasang terlalu dini. Jika paket mengizinkan persiapan awal, pastikan masa aktif baru berjalan sesuai pemicu yang tertulis.",
      },
      {
        title: "Tanyakan bila jadwal berubah atau aturannya kabur",
        body: "Hubungi penyedia sebelum memasang jika pemicu aktivasi tidak jelas atau jadwal penerbangan berubah. Simpan jawaban dan bukti pembelian.",
      },
      {
        title: "Siapkan langkah saat tiba",
        body: "Simpan instruksi dan kontak bantuan. Ikuti petunjuk paket untuk memilih jalur data; jika layanan belum muncul, minta bantuan sebelum menghapus profil atau memasang ulang.",
      },
    ],
    sources: [
      { label: "Apple: mengatur eSIM di iPhone", url: "https://support.apple.com/en-us/118669" },
      {
        label: "Apple: jika tidak dapat mengatur eSIM di iPhone",
        url: "https://support.apple.com/en-us/102478",
      },
      {
        label: "Samsung: eSIM dan perangkat Galaxy yang didukung",
        url: "https://www.samsung.com/sg/support/mobile-devices/galaxy-esim-and-supported-network-carriers/",
      },
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
