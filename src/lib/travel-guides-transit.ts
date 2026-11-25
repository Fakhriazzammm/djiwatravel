import type { TravelGuide } from "./travel-guides";

const PUBLISHED = "2026-11-25";

export const transitGuides: readonly TravelGuide[] = [
  {
    slug: "jr-pass-jepang-worth-it-tokyo-kyoto-osaka",
    title: "JR Pass Jepang Worth It? Hitung Rute Tokyo–Kyoto–Osaka Dulu",
    description:
      "Cek harga JR Pass 7 hari, pelajari cara membandingkannya dengan tiket Shinkansen satuan, dan lihat kapan pass layak dibeli.",
    eyebrow: "TRANSPORTASI JEPANG",
    heading: "JR Pass Jepang worth it untuk Tokyo, Kyoto, dan Osaka?",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "3 menit baca",
    image: "/assets/guides/jepang-jr-pass.jpg",
    imageAlt:
      "Ilustrasi traveler membaca peta di peron stasiun Jepang di samping kereta Shinkansen",
    summary:
      "Untuk rute Tokyo → Kyoto → Osaka dengan penerbangan pulang dari Kansai, mulailah dari harga tiket satuan. JR Pass nasional Ordinary 7 hari berharga ¥50.000 untuk dewasa di situs resmi. Pass mulai masuk akal jika total tiket yang dicakup mendekati harga itu atau lebih, setelah memperhitungkan biaya tambahan.",
    paragraphs: [
      "Kamu mendarat di Tokyo, menghabiskan dua malam di Kyoto, lalu pulang dari Osaka. Di peta kelihatannya seperti tiga perjalanan besar. Di anggaran, biasanya satu ruas yang mendominasi, yaitu Tokyo ke Kyoto. Kyoto ke Osaka bisa ditempuh dengan kereta lokal. Kalau tak perlu kembali ke Tokyo, hitung dulu dua ruas itu dan perjalanan bandara sebelum membeli pass.",
      "Per 25 November 2026, tarif JR Pass Ordinary dewasa untuk 7 hari adalah ¥50.000 jika dibeli di situs resmi. Untuk pembelian melalui agen luar negeri yang ditunjuk JR, harga acuannya ¥53.000 sejak 1 Oktober 2026. Pakai harga dari kanal yang sungguh akan kamu gunakan, termasuk biaya pemesanan atau kurs jika berlaku.",
      "Sekarang bayangkan tiketmu pulang dari Tokyo dan kamu juga ingin mampir ke Hiroshima. Kedua ruas tambahan itu layak dihitung ulang. Kumpulkan tarif perjalanan JR yang benar-benar akan dinaiki dalam masa berlaku pass yang sama. Jika sebagian perjalanan jatuh di luar masa itu, masukkan tarifnya sebagai tiket tambahan di kedua perbandingan.",
      "Bandingkan dua total dalam yen. Opsi tiket satuan adalah jumlah semua tarif pada rute asli. Opsi pass adalah harga pass ditambah tarif yang tidak dicakup, termasuk tambahan jika kamu memilih Nozomi atau Mizuho pada ruas yang mensyaratkan tiket khusus. Untuk membawa koper besar di Tokaido–Sanyo–Kyushu Shinkansen, cek pula aturan reservasi area bagasi.",
      "Sebagai simulasi, jika total tiket satuan yang dicakup adalah ¥42.000 dan biaya transportasi di luar cakupan sama untuk kedua opsi, tiket satuan menghemat ¥8.000 dibanding pass ¥50.000. Jika tiket satuan yang dicakup berjumlah ¥56.000, pass berpotensi hemat ¥6.000 sebelum biaya tambahan. Pakai angka dari jadwal yang benar-benar akan kamu ambil.",
      "Kalau selisihnya kecil, baca jam keberangkatan dan jumlah pindah kereta. Tiket langsung pada jam pilihanmu bisa lebih nyaman daripada mengubah agenda supaya pass terlihat hemat. Pisahkan juga anggaran metro dan bus kota agar biaya harian tetap terlihat.",
    ],
    steps: [
      {
        title: "Tulis tanggal dan stasiun setiap perjalanan",
        body: "Mulai dari bandara masuk dan keluar. Catat stasiun sebenarnya, misalnya Shin-Osaka untuk Shinkansen, supaya durasi dan sambungannya ikut terhitung.",
      },
      {
        title: "Ambil harga tiket untuk jadwal yang realistis",
        body: "Cari tiket satuan di operator untuk tanggal dan jenis kursi yang ingin kamu pakai. Bandingkan dengan harga pass dari situs resmi atau agen pilihanmu.",
      },
      {
        title: "Tambahkan biaya di luar cakupan pass",
        body: "Periksa metro, kereta swasta, perjalanan di luar masa aktif, dan tiket tambahan Nozomi atau Mizuho sebelum mengambil keputusan.",
      },
    ],
    faqs: [
      {
        question: "Berapa harga JR Pass Jepang 7 hari?",
        answer:
          "Per 25 November 2026, JR Pass Ordinary 7 hari untuk dewasa berharga ¥50.000 di situs resmi. Harga acuan agen luar negeri yang ditunjuk JR adalah ¥53.000. Cek harga lagi sebelum membeli.",
      },
      {
        question: "Apakah JR Pass bisa dipakai naik Nozomi atau Mizuho?",
        answer:
          "Bisa dengan tiket khusus tambahan untuk pemegang pass pada layanan yang ditentukan. Masukkan biaya tiket itu sebelum membandingkan total dengan tiket satuan.",
      },
      {
        question: "Apakah pergi Tokyo ke Osaka satu arah cukup untuk membeli JR Pass?",
        answer:
          "Satu perjalanan jauh biasanya belum cukup. Bandingkan tiket satuan untuk semua ruas yang akan kamu naiki dengan harga pass dan biaya tambahan sepanjang rute.",
      },
    ],
    keywords: ["JR Pass worth it", "harga JR Pass 7 hari", "tiket Shinkansen Tokyo Kyoto Osaka"],
    sources: [
      {
        label: "JR Group — Jenis dan harga Japan Rail Pass",
        url: "https://japanrailpass.net/en/purchase/price/",
      },
      {
        label: "JR Group — Cakupan dan cara memakai Japan Rail Pass",
        url: "https://japanrailpass.net/en/about_jrp/",
      },
      {
        label: "JR Central — Aturan bagasi Shinkansen",
        url: "https://global.jr-central.co.jp/en/info/oversized-baggage/index.html",
      },
    ],
    relatedDestinations: [{ code: "jp", label: "Lihat paket eSIM Jepang" }],
    relatedLinks: [
      {
        guide: "itinerary-jepang-7-hari-tokyo-kyoto-osaka",
        label: "Itinerary Tokyo, Kyoto, dan Osaka 7 hari",
      },
      {
        guide: "suica-vs-icoca-kartu-transportasi-jepang",
        label: "Suica atau ICOCA untuk kereta lokal?",
      },
    ],
  },
  {
    slug: "suica-vs-icoca-kartu-transportasi-jepang",
    title: "Suica vs ICOCA: Perlu Beli Kartu Baru Saat Pindah Kota?",
    description:
      "Mulai dari Tokyo atau Osaka? Ketahui kapan satu kartu IC cukup, cara tap dan isi saldo, serta batasnya untuk kereta antarkota.",
    eyebrow: "TRANSPORTASI JEPANG",
    heading: "Suica atau ICOCA untuk liburan Jepang? Pilih dari kota kedatangan",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "3 menit baca",
    image: "/assets/guides/jepang-ic-card.jpg",
    imageAlt: "Ilustrasi traveler menempelkan kartu IC ke pembaca di gerbang stasiun Jepang",
    summary:
      "Untuk kereta lokal, biasanya cukup punya satu kartu IC. Suica praktis jika kamu mulai dari Tokyo dan ICOCA praktis jika mulai dari Osaka. Keduanya bisa digunakan di banyak jaringan yang menerima kartu IC nasional, dengan batas untuk perjalanan lintas area dan layanan yang memerlukan tiket khusus.",
    paragraphs: [
      "Bayangkan sudah punya Suica dari Tokyo, lalu melihat mesin penjual ICOCA di Osaka. Untuk perjalanan lokal yang menerima kartu IC nasional, kamu bisa terus memakai Suica. Mulailah dengan kartu yang praktis didapat di kota kedatangan, lalu cek tanda penerimaan pada gerbang atau panduan operator di kota berikutnya.",
      "Suica dan ICOCA adalah kartu saldo. Di kereta lokal, tempel kartu saat masuk dan gunakan kartu yang sama saat keluar agar sistem menghitung tarifnya. Jika gerbang menolak karena saldo kurang, cari mesin penyesuaian tarif atau minta bantuan petugas. Kalau kartu terbaca salah, jangan berganti kartu di pintu keluar karena catatan masuk ada pada kartu pertama.",
      "Ada bedanya antara membawa kartu yang sama ke kota lain dan memakai saldo itu untuk satu perjalanan yang menyeberangi batas area IC. JR West menjelaskan bahwa perjalanan dengan ICOCA umumnya harus dimulai dan diakhiri dalam satu area layanan IC. Untuk ruas jauh, cek tiket yang diperlukan, termasuk bila Shinkansen punya layanan khusus untuk mengaitkan reservasi dengan kartu.",
      "Kalau memilih Welcome Suica fisik untuk kunjungan singkat, cek masa berlakunya yang 28 hari sejak pembelian. Saldo tersisa umumnya tidak bisa dikembalikan untuk kartu yang berfungsi normal. Isi secukupnya mendekati penerbangan pulang, lalu manfaatkan saldo di layanan atau toko yang memang menerima kartu itu.",
      "Untuk perjalanan kelompok, siapkan satu kartu perjalanan per penumpang yang memerlukan tiket. Simpan sedikit uang tunai agar kamu punya opsi isi ulang di mesin yang menerima tunai, terutama jika kartu bankmu gagal di mesin tertentu.",
    ],
    steps: [
      {
        title: "Pilih kartu berdasarkan kota awal",
        body: "Cek titik penjualan Suica atau Welcome Suica jika mulai di Tokyo. Jika tiba di Kansai, cari titik penjualan ICOCA sebelum menuju stasiun.",
      },
      {
        title: "Pisahkan kereta lokal dari kereta antarkota",
        body: "Pakai kartu saldo untuk rute lokal yang mendukungnya. Beli tiket sesuai ketentuan operator untuk Shinkansen atau perjalanan yang melewati batas area IC.",
      },
      {
        title: "Cek saldo sebelum masuk gerbang",
        body: "Isi seperlunya, terutama menjelang pulang. Jika muncul kesalahan di gerbang, tunjukkan kartu yang dipakai saat masuk kepada petugas.",
      },
    ],
    faqs: [
      {
        question: "Bisa pakai Suica di Osaka dan ICOCA di Tokyo?",
        answer:
          "Bisa pada banyak jaringan yang menerima kartu IC nasional. Cek cakupan operator, terutama untuk bus daerah atau perjalanan ke stasiun kecil.",
      },
      {
        question: "Apakah saldo Welcome Suica bisa dicairkan sebelum pulang?",
        answer:
          "Untuk Welcome Suica fisik yang berfungsi normal, saldo tersisa umumnya tidak dapat dikembalikan. Ketentuan saldo dan deposit Suica reguler berbeda.",
      },
      {
        question: "Bisa langsung tap Suica untuk Shinkansen Tokyo–Kyoto?",
        answer:
          "Untuk perjalanan ini, siapkan tiket Shinkansen. Jika memakai layanan reservasi yang mendukung kartu IC, tautkan tiket dan kartu sesuai petunjuk sebelum masuk gerbang.",
      },
    ],
    keywords: ["Suica vs ICOCA", "kartu transportasi Jepang", "cara pakai Welcome Suica"],
    sources: [
      {
        label: "JNTO — Panduan kereta Jepang dan masa berlaku Welcome Suica",
        url: "https://www.japan.travel/en/guide/how-to-travel-by-train-and-bus-in-japan/",
      },
      {
        label: "JNTO — Penggunaan dan saldo kartu IC wisatawan",
        url: "https://www.japan.travel/en/plan/cashless-payments-in-japan/",
      },
      {
        label: "JR West — Cakupan dan batas area ICOCA",
        url: "https://www.westjr.co.jp/global/en/howto/icoca/area/",
      },
      {
        label: "JR Central — Naik Shinkansen dengan kartu IC yang ditautkan",
        url: "https://smart-ex.jp/en/entraining/iccard/",
      },
    ],
    relatedDestinations: [{ code: "jp", label: "Lihat paket eSIM Jepang" }],
    relatedLinks: [
      {
        guide: "jr-pass-jepang-worth-it-tokyo-kyoto-osaka",
        label: "Cara menghitung JR Pass vs tiket satuan",
      },
      { guide: "checklist-persiapan-ke-jepang", label: "Checklist persiapan ke Jepang" },
    ],
  },
  {
    slug: "cara-naik-mrt-singapura-kartu-contactless-ez-link",
    title: "Naik MRT Singapura Pakai Kartu Indonesia? Cek Biayanya",
    description:
      "Cara bayar MRT Singapura dari Changi dengan kartu contactless, biaya harian kartu Visa atau Mastercard Indonesia, dan kapan EZ-Link lebih praktis.",
    eyebrow: "TRANSPORTASI SINGAPURA",
    heading: "Cara naik MRT Singapura pakai kartu Indonesia atau EZ-Link",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "3 menit baca",
    image: "/assets/guides/singapura-mrt.jpg",
    imageAlt:
      "Ilustrasi traveler menempelkan kartu bank ke gerbang MRT Singapura bersama keluarganya",
    summary:
      "Kartu Visa atau Mastercard contactless dari Indonesia bisa dipakai untuk membayar MRT Singapura jika bank mengaktifkan penggunaan luar negeri. SimplyGo mengenakan biaya admin S$0,60 per hari penggunaan untuk kartu asing tersebut. Saat masuk dan keluar, gunakan kartu fisik yang sama atau perangkat yang sama.",
    paragraphs: [
      "Baru keluar dari pengambilan bagasi di Changi dan ingin langsung naik MRT? Kalau kartu bankmu mendukung pembayaran contactless internasional, kamu bisa langsung menuju gerbang tanpa membeli kartu saldo. Periksa simbol contactless pada kartu dan cek pengaturan transaksi luar negeri di aplikasi bank sebelum terbang.",
      "Biaya admin S$0,60 berlaku untuk hari ketika kartu asing dipakai membayar tarif, misalnya tiga hari penggunaan berarti S$1,80 di luar ongkos perjalanan dan kemungkinan biaya bank penerbit. Untuk kunjungan singkat, biaya itu bisa lebih kecil daripada biaya membeli kartu saldo. Hitung jumlah hari dan jumlah penumpang sebelum memutuskan.",
      "Kesalahan yang gampang terjadi adalah masuk dengan kartu fisik lalu keluar dengan Apple Pay atau dompet digital lain yang menyimpan kartu yang sama. Pembaca gerbang tetap bisa mengenalinya sebagai dua metode berbeda. Keluarkan kartu pilihan dari dompet supaya pembaca tidak mendeteksi beberapa kartu sekaligus.",
      "Siapkan satu metode bayar per penumpang yang perlu tiket. Kalau bepergian dengan keluarga dan kartu terpisah terbatas, kartu saldo EZ-Link bisa praktis. Singapore Tourist Pass layak dibandingkan jika kamu berencana sering naik MRT, LRT, dan bus dasar dalam masa berlaku pass. Bandingkan harga pass dengan perkiraan tarif perjalanan harian, termasuk biaya admin jika memakai kartu asing.",
      "Stasiun MRT Changi terhubung langsung ke Terminal 2 dan 3. Dari bandara, lanjut melalui Tanah Merah untuk East West Line atau Expo untuk Downtown Line, sesuai posisi hotel. Periksa kereta terakhir jika tiba malam, terutama bila rute masih perlu satu kali pindah jalur.",
    ],
    steps: [
      {
        title: "Cek kartu dan siapkan opsi cadangan",
        body: "Pastikan fitur contactless dan transaksi luar negeri aktif. Siapkan kartu kedua atau rencanakan pembelian EZ-Link jika kartu utama ditolak.",
      },
      {
        title: "Pilih satu kartu atau perangkat per penumpang",
        body: "Gunakan metode yang sama dari tap masuk sampai tap keluar. Jika HP kehabisan baterai setelah tap masuk, hubungi petugas sebelum mencoba kartu lain.",
      },
      {
        title: "Simpan jalur dari Changi sampai pintu hotel",
        body: "Catat stasiun transit, arah kereta, nomor pintu keluar, dan estimasi jalan kaki. Cek jam kereta terakhir sebelum berangkat jika pesawat mendarat malam.",
      },
    ],
    faqs: [
      {
        question: "Apakah harus beli EZ-Link untuk naik MRT Singapura?",
        answer:
          "Tidak wajib. Kartu bank contactless yang didukung SimplyGo bisa langsung dipakai jika aktif untuk transaksi luar negeri. EZ-Link berguna sebagai opsi kartu saldo.",
      },
      {
        question: "Apakah biaya S$0,60 dipotong setiap naik MRT?",
        answer:
          "Untuk Visa dan Mastercard terbitan luar Singapura, SimplyGo mengenakannya per hari penggunaan. Tarif perjalanan dan biaya tambahan dari bank dihitung terpisah.",
      },
      {
        question: "Kalau masuk dengan HP, boleh keluar pakai kartu fisik?",
        answer:
          "Gunakan HP yang sama untuk masuk dan keluar. Nomor pengenal kartu di dompet digital bisa berbeda dari kartu fisik dan dianggap sebagai transaksi terpisah.",
      },
    ],
    keywords: ["cara naik MRT Singapura", "MRT Singapura kartu Indonesia", "EZ-Link vs SimplyGo"],
    sources: [
      {
        label: "SimplyGo — Pembayaran transportasi dengan kartu contactless",
        url: "https://www.simplygo.com.sg/faqs/cards-and-charms/simplygo/contactless-bank-cards",
      },
      {
        label: "Changi Airport — Transportasi dan koneksi MRT",
        url: "https://www.changiairport.com/en/at-changi/transport-and-directions/getting-to-changi-airport.html",
      },
      {
        label: "SimplyGo — Singapore Tourist Pass",
        url: "https://thesingaporetouristpass.com.sg/faq/singapore-tourist-pass/",
      },
    ],
    relatedDestinations: [{ code: "sg", label: "Lihat paket eSIM Singapura" }],
    relatedLinks: [
      {
        guide: "tips-internet-traveling-ke-singapura-dan-malaysia",
        label: "Siapkan internet untuk Singapura dan Malaysia",
      },
    ],
  },
  {
    slug: "incheon-ke-seoul-arex-express-all-stop",
    title: "Dari Incheon ke Seoul: AREX Express atau All-Stop?",
    description:
      "Pilih kereta AREX dari Terminal 1 atau 2 berdasarkan lokasi hotel. Cek rute Hongdae, Seoul Station, T-money, dan opsi saat mendarat malam.",
    eyebrow: "TRANSPORTASI KOREA",
    heading: "Incheon ke Seoul naik AREX: pilih kereta dari lokasi hotelmu",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "3 menit baca",
    image: "/assets/guides/korea-arex.jpg",
    imageAlt: "Ilustrasi traveler membawa koper di peron kereta bandara Incheon",
    summary:
      "Dari Bandara Incheon, pilih AREX All-Stop jika menginap di Hongdae karena kereta berhenti di Hongik University. Pilih AREX Express jika tujuanmu Seoul Station dan kamu ingin kursi bernomor. Kedua layanan berangkat dari Terminal 1 dan 2. Hitung juga waktu pindah kereta dan jalan kaki ke hotel.",
    paragraphs: [
      "Penginapanmu lima menit dari Hongik University? Ambil All-Stop dari bandara. Kamu bisa turun langsung di Hongdae, tanpa memutar ke Seoul Station lalu naik subway kembali. Kalau tujuanmu dekat Seoul Station atau lanjut naik KTX, Express lebih masuk akal, terutama jika jadwalnya pas dengan waktu keluar dari bandara.",
      "Setelah mengambil koper, ikuti papan Airport Railroad menuju Transportation Center di lantai B1 terminal kedatangan. Pastikan antre di area layanan yang kamu butuhkan. Untuk Express, beli tiket khusus dengan kursi bernomor. Untuk All-Stop, kamu bisa memakai kartu transportasi seperti T-money atau membeli tiket sekali jalan.",
      "Sebagai patokan dari Terminal 1 ke Seoul Station, Seoul Tourism Organization mencantumkan Express sekitar 43 menit dengan tarif dewasa ₩13.000 dan All-Stop sekitar 59 menit dengan tarif kartu dewasa ₩4.750 pada Juni 2026. Terminal 2 dan stasiun lain punya hitungan berbeda. Cek jadwal dan tarif terbaru dari titik asalmu sebelum membeli.",
      "Kalau hotel di Myeongdong, coba bandingkan AREX ke Seoul Station lalu lanjut Subway Line 4 dengan bus bandara yang berhenti dekat penginapan. Tambahkan waktu menunggu, jarak dari peron ke jalur berikutnya, dan jalan kaki dari pintu keluar. Membawa dua koper bisa membuat perjalanan tanpa pindah kendaraan lebih enak, meski waktu di kendaraan lebih panjang.",
      "Jika tiba malam, lihat waktu keberangkatan dari terminalmu sesudah perkiraan imigrasi dan pengambilan bagasi. Cek juga jam kereta lanjutan. Kalau rutenya terlalu mepet, simpan alamat hotel dalam tulisan Korea dan gunakan bus bandara yang masih beroperasi atau taksi resmi.",
    ],
    steps: [
      {
        title: "Catat terminal kedatangan dan nama stasiun tujuan",
        body: "Gunakan nama pada tiket pesawat dan peta. Untuk Hongdae, cari Hongik University Station. Untuk perjalanan KTX lanjutan, cek apakah tiketmu berangkat dari Seoul Station.",
      },
      {
        title: "Beli tiket sesuai jenis kereta",
        body: "Ikuti petunjuk Express untuk tiket berkursi atau gunakan T-money atau tiket sekali jalan untuk All-Stop.",
      },
      {
        title: "Simpan satu rute cadangan",
        body: "Periksa bus bandara yang berhenti dekat hotel atau loket taksi resmi. Simpan alamat, pintu keluar stasiun, dan kontak penginapan sebelum terbang.",
      },
    ],
    faqs: [
      {
        question: "Naik AREX apa untuk ke Hongdae?",
        answer:
          "Pilih All-Stop dan turun di Hongik University. AREX Express langsung menuju Seoul Station dan tidak berhenti di Hongdae.",
      },
      {
        question: "Bisa naik AREX Express dengan tap T-money?",
        answer:
          "AREX Express memerlukan tiket tersendiri. Gunakan T-money untuk tarif All-Stop pada gerbang layanan itu.",
      },
      {
        question: "Dari terminal mana AREX berangkat?",
        answer:
          "Kedua jenis AREX melayani Terminal 1 dan Terminal 2. Ikuti papan Airport Railroad menuju Transportation Center B1 di terminal kedatanganmu.",
      },
    ],
    keywords: ["Incheon ke Seoul", "AREX Express vs All-Stop", "Incheon ke Hongdae naik kereta"],
    sources: [
      {
        label: "Incheon International Airport — Lokasi stasiun dan akses AREX",
        url: "https://airport.kr/ap_en/1511/subview.do",
      },
      {
        label: "Seoul Tourism Organization — Rute, durasi, dan tarif dari Incheon",
        url: "https://english.visitseoul.net/airport-to-seoul",
      },
    ],
    relatedDestinations: [{ code: "kr", label: "Lihat paket eSIM Korea Selatan" }],
    relatedLinks: [
      {
        guide: "esim-korea-selatan-untuk-liburan",
        label: "Panduan eSIM dan peta di Korea Selatan",
      },
      { guide: "cara-pakai-tmoney-seoul-beli-top-up", label: "Cara beli dan isi saldo T-money" },
    ],
  },
  {
    slug: "suvarnabhumi-ke-bangkok-airport-rail-link",
    title: "Suvarnabhumi ke Bangkok: Turun di Makkasan atau Phaya Thai?",
    description:
      "Panduan naik Airport Rail Link dari bandara BKK, memilih stasiun untuk Siam, Pratunam atau Asok, dan menghitung biaya sambungan.",
    eyebrow: "TRANSPORTASI THAILAND",
    heading: "Cara naik Airport Rail Link dari Suvarnabhumi ke Bangkok",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "3 menit baca",
    image: "/assets/guides/bangkok-airport-rail-link.jpg",
    imageAlt: "Ilustrasi kereta bandara melintas di jalur layang di atas permukiman Bangkok",
    summary:
      "Dari Bandara Suvarnabhumi (BKK), ikuti papan Airport Rail Link ke lantai bawah tanah. Turun di Phaya Thai untuk pindah ke BTS jalur Sukhumvit, di Makkasan untuk MRT Blue Line lewat Phetchaburi, atau di Ratchaprarop jika hotelmu memang dekat area Pratunam.",
    paragraphs: [
      "Mengetik “Bangkok” di mesin pencari rute belum cukup untuk memilih stasiun turun. Hotel dekat Siam sering mudah dicapai lewat Phaya Thai dan BTS. Untuk area Asok atau Sukhumvit, bandingkan turun di Makkasan lalu berjalan ke MRT Phetchaburi, satu stasiun dari MRT Sukhumvit. Kalau menginap dekat Ratchaprarop, bisa jadi kamu cukup berjalan dari stasiun Airport Rail Link.",
      "Stasiun Airport Rail Link ada di lantai B bandara. Ikuti petunjuk City Line dan beli tiket sesuai stasiun tujuan. Pemerintah Thailand mencantumkan kisaran 15–45 baht menurut jarak, dengan waktu di kereta ke ujung jalur sekitar 30 menit. Cek tarif dan informasi operasional pada hari perjalanan.",
      "Di Phaya Thai, ikuti papan BTS. Di Makkasan, cari petunjuk jalan penghubung ke MRT Phetchaburi. Anggarkan tarif lanjutan secara terpisah. Jika rute lanjutannya termasuk jalan kaki, lihat jarak dari pintu keluar stasiun ke pintu hotel, terutama saat membawa koper atau bepergian dengan anak.",
      "Taksi resmi patut dibandingkan jika tujuan jauh dari stasiun, kamu mendarat setelah kereta terakhir, atau ada beberapa orang yang bisa berbagi biaya. Bandingkan ongkos kendaraan hingga hotel dengan total tiket kereta untuk rombongan, plus transfer dan kemungkinan tol jika memakai taksi.",
      "Cek kode bandara di tiket sebelum menyimpan petunjuk ini. Airport Rail Link berangkat dari Suvarnabhumi (BKK). Kalau tiketmu tertulis Don Mueang (DMK), cari rute khusus DMK agar tidak mengikuti petunjuk pindah jalur yang keliru.",
    ],
    steps: [
      {
        title: "Mulai dari alamat hotel, lalu pilih stasiun turun",
        body: "Cek apakah lebih cepat menyambung BTS di Phaya Thai, MRT di Makkasan, atau berjalan dari Ratchaprarop.",
      },
      {
        title: "Dari kedatangan, ikuti papan Airport Rail Link",
        body: "Turun ke lantai B, beli tiket City Line sesuai tujuan, dan cek arah kereta ke Phaya Thai.",
      },
      {
        title: "Siapkan rute jika penerbangan terlambat",
        body: "Simpan alamat hotel dan jadwal kereta terakhir. Jika sambungan sudah berhenti, gunakan transportasi resmi bandara yang masih tersedia.",
      },
    ],
    faqs: [
      {
        question: "Berapa tarif Airport Rail Link dari Suvarnabhumi?",
        answer:
          "Panduan pemerintah Thailand mencantumkan kisaran 15–45 baht menurut stasiun tujuan. Periksa tarif hari itu dan anggarkan tiket BTS atau MRT terpisah jika pindah jalur.",
      },
      {
        question: "Jika hotel di Pratunam, turun di mana?",
        answer:
          "Cek apakah Ratchaprarop cukup dekat untuk jalan kaki membawa koper. Untuk hotel dekat Siam atau stasiun BTS lain, Phaya Thai bisa memberi sambungan yang lebih praktis.",
      },
      {
        question: "Apakah Airport Rail Link langsung ke Don Mueang?",
        answer:
          "Rute ini menghubungkan Suvarnabhumi dengan Phaya Thai. Gunakan panduan transportasi Don Mueang jika tiket penerbanganmu mencantumkan kode DMK.",
      },
    ],
    keywords: ["Suvarnabhumi ke Bangkok", "Airport Rail Link Bangkok", "Makkasan atau Phaya Thai"],
    sources: [
      {
        label: "Pemerintah Thailand — Stasiun, sambungan, dan tarif Airport Rail Link",
        url: "https://thailand.go.th/public/guide-book-detail/001_01_107-2",
      },
      {
        label: "Pemerintah Thailand — Pilihan transportasi dari Suvarnabhumi",
        url: "https://thailand.go.th/public/index.php/issue-focus-detail/001_01_108",
      },
    ],
    relatedDestinations: [{ code: "th", label: "Lihat paket eSIM Thailand" }],
    relatedLinks: [
      {
        guide: "esim-thailand-bangkok-phuket-panduan",
        label: "Panduan eSIM Thailand untuk Bangkok dan Phuket",
      },
    ],
  },
  {
    slug: "kansai-airport-ke-osaka-nankai-rapit-haruka",
    title: "Kansai Airport ke Osaka: Salah Pilih Kereta Bisa Muter",
    description:
      "Pilih Nankai Rapi:t atau Airport Express untuk Namba, dan JR Haruka untuk Tennoji, Osaka Station, Shin-Osaka, atau Kyoto.",
    eyebrow: "TRANSPORTASI JEPANG",
    heading: "Kansai Airport ke Osaka naik Nankai atau JR Haruka?",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "3 menit baca",
    image: "/assets/guides/kansai-ke-osaka.jpg",
    imageAlt: "Ilustrasi dua traveler membawa koper di peron kereta bandara Kansai",
    summary:
      "Dari Bandara Kansai (KIX), pilih Nankai jika hotel dekat Nankai Namba, dan pertimbangkan JR Haruka jika menuju Tennoji, Osaka Station, Shin-Osaka, atau Kyoto. Bandingkan waktu sampai pintu hotel, termasuk jalan kaki dan pindah jalur. Rapi:t memakai kursi reservasi dan membutuhkan tiket limited express.",
    paragraphs: [
      "Di aplikasi peta, hotel dekat Dotonbori bisa berlabel Osaka. Namun memilih Osaka Station hanya karena namanya sama dengan nama kota bisa menambah satu kali pindah kereta. Buka alamat hotel dan lihat stasiun yang benar-benar terdekat. Nankai Namba berada di kawasan yang berbeda dari Osaka Station di Umeda dan Shin-Osaka, tempat Shinkansen berhenti.",
      "Kalau kamu menginap dekat Nankai Namba, bandingkan dua kereta Nankai. Rapi:t memberi tempat duduk bernomor, tetapi membutuhkan tiket limited express selain tarif dasar atau tiket digital yang mencakup keduanya. Airport Express reguler juga menuju Namba, tanpa tiket limited express. Bila Rapi:t berikutnya masih lama, Airport Express yang berangkat lebih dulu bisa tiba lebih cepat.",
      "JR Haruka berguna jika tujuanmu dekat salah satu perhentiannya, seperti Tennoji, Osaka Station, Shin-Osaka, atau Kyoto. Jika lanjut Shinkansen, cocokkan nama stasiun pada reservasi. Periksa peron dan waktu pindah kereta agar jadwal realistis saat membawa koper.",
      "Stasiun bandara berada di sisi Terminal 1, terhubung ke area Aeroplaza. Jika tiba di Terminal 2, perhitungkan perjalanan shuttle menuju Aeroplaza sebelum naik kereta. Untuk penerbangan malam, cek jadwal terakhir dari Kansai Airport Station dan sambungan setelah turun.",
    ],
    steps: [
      {
        title: "Catat nama stasiun terdekat dari hotel",
        body: "Cek apakah hotel dekat Nankai Namba, Tennoji, Osaka Station, atau Shin-Osaka. Lihat jarak dari pintu keluar stasiun, bukan sekadar jarak di garis lurus.",
      },
      {
        title: "Cocokkan operator dengan tujuan",
        body: "Cari Nankai untuk Namba atau JR untuk rute Haruka. Periksa apakah tiket yang kamu pilih sudah termasuk reservasi kursi.",
      },
      {
        title: "Simpan jalur dari terminal ke stasiun",
        body: "Tambahkan waktu ambil bagasi dan shuttle jika tiba di T2. Jika jadwal mepet, bandingkan bus bandara berdasarkan titik turun.",
      },
    ],
    faqs: [
      {
        question: "Dari Kansai Airport ke Dotonbori turun di mana?",
        answer:
          "Nankai Namba sering praktis untuk Dotonbori. Buka alamat hotel untuk menentukan pintu keluar dan jarak berjalan kaki yang tepat.",
      },
      {
        question: "Apa beda Nankai Rapi:t dan Airport Express?",
        answer:
          "Rapi:t adalah limited express dengan kursi reservasi dan biaya tambahan. Airport Express reguler juga melayani Namba tanpa tiket limited express.",
      },
      {
        question: "Apakah JR Haruka berhenti di Osaka Station?",
        answer:
          "Ya. Haruka melayani Osaka Station dan juga berhenti di Shin-Osaka. Cocokkan nama persisnya dengan stasiun tujuan pada tiket.",
      },
    ],
    keywords: ["Kansai Airport ke Osaka", "Nankai Rapi:t vs Haruka", "Kansai Airport ke Namba"],
    sources: [
      {
        label: "Nankai Electric Railway — Rapi:t dan jenis tiket",
        url: "https://www.nankai.co.jp/en_railway/traffic/express/rapit.html",
      },
      {
        label: "JR West — Rute dan tiket Haruka",
        url: "https://www.westjr.co.jp/travel-information/en/tickets-passes/oneway/haruka/",
      },
      {
        label: "JR West — Akses kereta dari Kansai Airport",
        url: "https://www.westjr.co.jp/global/en/travel/shopping/access/train.html",
      },
    ],
    relatedDestinations: [{ code: "jp", label: "Lihat paket eSIM Jepang" }],
    relatedLinks: [
      { guide: "itinerary-jepang-7-hari-tokyo-kyoto-osaka", label: "Itinerary Jepang 7 hari" },
      {
        guide: "suica-vs-icoca-kartu-transportasi-jepang",
        label: "Pilih kartu IC untuk kereta lokal",
      },
    ],
  },
  {
    slug: "klia-ke-kuala-lumpur-ekspres-atau-transit",
    title: "KLIA Ekspres vs Transit: Mana yang Lebih Cepat ke Hotel?",
    description:
      "Bandingkan kereta KLIA Ekspres dan Transit dari Terminal 1 atau 2, termasuk kapan turun di KL Sentral, Putrajaya, atau Bandar Tasik Selatan.",
    eyebrow: "TRANSPORTASI MALAYSIA",
    heading: "KLIA ke Kuala Lumpur naik Ekspres atau Transit?",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "3 menit baca",
    image: "/assets/guides/klia-ke-kuala-lumpur.jpg",
    imageAlt: "Ilustrasi kereta ekspres bandara di jalur layang Kuala Lumpur menjelang malam",
    summary:
      "KLIA Ekspres cocok jika tujuanmu KL Sentral dan jadwalnya pas. KLIA Transit juga berangkat dari Terminal 1 dan 2 serta berhenti di stasiun antara, termasuk Putrajaya & Cyberjaya dan Bandar Tasik Selatan. Untuk memilih, hitung waktu tunggu, waktu di kereta, dan sambungan sampai hotel.",
    paragraphs: [
      "Tujuanmu KL Sentral, tetapi KLIA Transit berikutnya sudah ada di layar, sementara Ekspres masih lama. Bandingkan jam tiba, bukan cuma lama perjalanan. Operator mencatat KLIA Ekspres sekitar 28 menit antara KL Sentral dan T1 serta sekitar tiga menit untuk ruas T1–T2. Waktu itu belum memasukkan antrean, menunggu kereta, atau perjalanan lanjut dari KL Sentral.",
      "Kalau kamu menuju Terminal Bersepadu Selatan untuk naik bus antarkota, coba KLIA Transit ke Bandar Tasik Selatan. Kalau tujuanmu Putrajaya, cek sambungan dari Putrajaya & Cyberjaya. Langsung turun di stasiun antara bisa menghindari perjalanan ke pusat kota dan kembali lagi ke selatan.",
      "KL Sentral juga belum tentu titik turun terakhir. Untuk hotel di Bukit Bintang, cari jalur lanjutan yang sesuai, misalnya menuju MRT Muzium Negara lewat jalur penghubung dari KL Sentral. Perhitungkan ruang untuk menunggu, pindah lantai, dan berjalan kaki membawa koper.",
      "Bandingkan tarif pada tanggal perjalanan, termasuk jumlah penumpang dan ongkos sambungan. Jika bepergian bersama keluarga, total kereta dihitung per orang. Untuk kedatangan larut atau hotel jauh dari stasiun, bandingkan dengan kendaraan resmi yang langsung ke penginapan.",
    ],
    steps: [
      {
        title: "Periksa terminal kedatangan",
        body: "Cari terminal T1 atau T2 pada tiket, lalu gunakan jadwal keberangkatan dari terminal tersebut.",
      },
      {
        title: "Pilih stasiun berdasarkan tujuan",
        body: "Masukkan KL Sentral, Putrajaya & Cyberjaya, atau Bandar Tasik Selatan sesuai rute hotel. Beli tiket yang sesuai layanan dan titik turun.",
      },
      {
        title: "Ukur perjalanan dari pintu ke pintu",
        body: "Jumlahkan waktu tunggu, perjalanan kereta, waktu pindah, dan jalan kaki. Siapkan rute cadangan jika kereta terakhir sudah berangkat.",
      },
    ],
    faqs: [
      {
        question: "Apakah KLIA Ekspres berangkat dari Terminal 2?",
        answer:
          "Ya. KLIA Ekspres melayani Terminal 1 dan 2. Cek keberangkatan dari terminal yang tercantum pada tiket pesawat.",
      },
      {
        question: "Kereta mana yang berhenti di Putrajaya?",
        answer:
          "Pilih KLIA Transit dan turun di Putrajaya & Cyberjaya. KLIA Ekspres tidak melayani pemberhentian itu.",
      },
      {
        question: "Dari KLIA ke Terminal Bersepadu Selatan turun di mana?",
        answer:
          "Naik KLIA Transit ke Bandar Tasik Selatan, lalu ikuti petunjuk penghubung menuju Terminal Bersepadu Selatan.",
      },
    ],
    keywords: ["KLIA ke Kuala Lumpur", "KLIA Ekspres vs KLIA Transit", "KLIA ke KL Sentral"],
    sources: [
      {
        label: "Express Rail Link — Rute dan jadwal KLIA Ekspres",
        url: "https://www.kliaekspres.com/products-fares/klia-ekspres/",
      },
      {
        label: "Express Rail Link — Rute dan jadwal KLIA Transit",
        url: "https://www.kliaekspres.com/products-fares/klia-transit",
      },
      {
        label: "Express Rail Link — Peta sambungan transportasi Klang Valley",
        url: "https://www.kliaekspres.com/media/uznlush5/erl_kv-integrated-transit-map_updated-0726.pdf",
      },
    ],
    relatedDestinations: [{ code: "my", label: "Lihat paket eSIM Malaysia" }],
    relatedLinks: [
      {
        guide: "tips-internet-traveling-ke-singapura-dan-malaysia",
        label: "Siapkan internet di Malaysia dan Singapura",
      },
      {
        guide: "cara-naik-mrt-singapura-kartu-contactless-ez-link",
        label: "Lanjut ke Singapura? Ini cara naik MRT",
      },
    ],
  },
  {
    slug: "cara-pakai-tmoney-seoul-beli-top-up",
    title: "T-money Seoul: Cara Beli, Isi Saldo, dan Tap Saat Turun",
    description:
      "Temukan tempat membeli T-money fisik, cara isi ulang dengan won, aturan tap bus dan subway, serta kapan butuh tiket AREX terpisah.",
    eyebrow: "TRANSPORTASI KOREA",
    heading: "Cara pakai T-money di Seoul dari top up sampai pindah bus",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "3 menit baca",
    image: "/assets/guides/tmoney-seoul.jpg",
    imageAlt: "Ilustrasi traveler menempelkan kartu transit ke pembaca di stasiun Seoul",
    summary:
      "Beli kartu T-money fisik di minimarket yang menjual kartu transportasi. Siapkan uang tunai won untuk mengisi saldo, lalu tap saat naik dan turun bus atau saat masuk dan keluar subway. Gunakan kartu yang sama saat pindah moda agar tarif transfer bisa dihitung jika rutenya memenuhi syarat.",
    paragraphs: [
      "T-money baru di tangan belum tentu punya saldo yang cukup untuk perjalanan pertama. Di minimarket yang melayani isi ulang, minta saldo dimasukkan ke kartu sambil menunjukkan uang tunai won. Kamu juga bisa mengisi di mesin stasiun yang mendukungnya. Cek angka pada layar sebelum masuk gerbang, terutama kalau baru membeli kartu bergambar khusus.",
      "Saat naik bus, tap pada pembaca ketika masuk. Saat turun, tap lagi sebelum keluar. Kalau kamu akan pindah ke subway atau bus lanjutan, tap keluar mencatat akhir perjalanan dan membantu sistem menghitung tarif transfer. Di subway, gunakan kartu yang sama pada gerbang masuk dan keluar.",
      "Untuk keluarga yang sering berpindah antara bus dan subway, satu kartu per penumpang yang memerlukan tiket biasanya paling sederhana. Dengan begitu, catatan masuk, keluar, dan transfer setiap orang tetap terpisah. Tanyakan aturan tarif anak jika bepergian dengan anak, karena penggunaan kartu tarif biasa tidak otomatis mengaktifkan tarif anak.",
      "Kalau perjalanan dimulai dari Incheon, T-money dapat digunakan untuk AREX All-Stop. Untuk kursi bernomor di AREX Express, siapkan tiket Express tersendiri. Menjelang pulang, isi saldo secukupnya. Jika masih banyak tersisa, buka panduan resmi KTO untuk melihat tempat dan batas nominal pengembalian.",
    ],
    steps: [
      {
        title: "Beli kartu dan tambah saldo secara terpisah",
        body: "Cari minimarket yang menjual T-money, cek saldo awal, dan siapkan uang tunai won untuk isi ulang.",
      },
      {
        title: "Biasakan tap masuk dan keluar",
        body: "Pada bus, cari pembaca sebelum turun. Pada subway, gunakan kartu yang sama di kedua gerbang.",
      },
      {
        title: "Cek lagi sebelum perjalanan terakhir",
        body: "Jika akan kembali ke bandara, periksa apakah kamu memilih All-Stop atau Express. Isi hanya saldo yang akan dibutuhkan.",
      },
    ],
    faqs: [
      {
        question: "Di mana bisa beli T-money fisik di Korea?",
        answer:
          "Biasanya di minimarket yang menjual kartu transportasi, termasuk lokasi di bandara. Tanya petugas apakah kartu tersedia dan bisa langsung diisi di sana.",
      },
      {
        question: "Perlu tap T-money saat turun dari bus Seoul?",
        answer:
          "Ya. Tap turun membantu mencatat akhir perjalanan dan menghitung potongan transfer jika perjalanan berikutnya memenuhi syarat.",
      },
      {
        question: "Bisa bayar subway Seoul dengan kartu T-money yang sama untuk dua orang?",
        answer:
          "Siapkan satu kartu per penumpang yang memerlukan tiket saat naik subway. Satu kartu membantu mencatat satu perjalanan dari gerbang masuk sampai gerbang keluar.",
      },
    ],
    keywords: ["cara pakai T-money Korea", "cara isi saldo T-money Seoul", "beli T-money Incheon"],
    sources: [
      {
        label:
          "Korea Tourism Organization — Membeli, mengisi, dan mengembalikan saldo kartu transportasi",
        url: "https://english.visitkorea.or.kr/svc/contents/infoHtmlView.do?vcontsId=140663",
      },
      {
        label: "Seoul Tourism Organization — Cara naik bus dan transfer",
        url: "https://english.visitseoul.net/bus",
      },
      {
        label: "Seoul Tourism Organization — Tiket AREX Express dan All-Stop",
        url: "https://english.visitseoul.net/airport-to-seoul",
      },
    ],
    relatedDestinations: [{ code: "kr", label: "Lihat paket eSIM Korea Selatan" }],
    relatedLinks: [
      { guide: "incheon-ke-seoul-arex-express-all-stop", label: "Pilih kereta AREX dari Incheon" },
      { guide: "esim-korea-selatan-untuk-liburan", label: "Siapkan eSIM untuk Korea Selatan" },
    ],
  },
  {
    slug: "bandara-hong-kong-ke-kota-airport-express-atau-bus",
    title: "Bandara Hong Kong ke Kota: Airport Express atau Bus?",
    description:
      "Bandingkan Airport Express dan bus bandara menuju Central, Kowloon, atau hotel. Pahami lokasi stasiun, biaya sambungan, dan opsi malam.",
    eyebrow: "TRANSPORTASI HONG KONG",
    heading: "Dari bandara Hong Kong, pilih Airport Express atau bus?",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "3 menit baca",
    image: "/assets/guides/hong-kong-airport-express.jpg",
    imageAlt: "Ilustrasi traveler dengan koper di peron kereta Airport Express Hong Kong",
    summary:
      "Airport Express memakan waktu sekitar 24 menit dari bandara ke Hong Kong Station dan juga berhenti di Kowloon. Bus bandara bisa lebih praktis jika halte turun dekat hotel atau jika kamu tiba setelah kereta terakhir. Bandingkan waktu dan biaya sampai pintu penginapan, termasuk sambungan.",
    paragraphs: [
      "Airport Express terlihat mudah di peta. Tapi nama Kowloon Station belum berarti stasiunnya dekat semua hotel di Kowloon. Kalau menginap di Tsim Sha Tsui atau Mong Kok, cari jarak dari stasiun ke lobi hotel. Bus bandara yang berhenti satu blok dari hotel bisa memberi perjalanan yang lebih sederhana, terutama jika harus membawa koper sendiri.",
      "Airport Express punya pemberhentian di Tsing Yi, Kowloon, dan Hong Kong Station dari arah bandara menuju kota. MTR mencantumkan sekitar 22 menit antara bandara dan Kowloon, serta sekitar 24 menit antara bandara dan Hong Kong Station. Tambahkan waktu berjalan dari peron dan ongkos sambungan bila harus lanjut MTR atau kendaraan lain.",
      "Untuk memilih bus, buka daftar resmi bandara dan cocokkan nomor rute, nama halte, serta arah. Tutup peta setelah menyimpan nama halte dalam bahasa Inggris dan, bila tersedia, tulisan setempat. Perhitungkan bahwa lama perjalanan bus bergantung pada kondisi lalu lintas.",
      "Cek tarif kereta untuk stasiun tujuan dan metode pembayaran yang akan dipakai. MTR menampilkan tarif Airport Express menurut stasiun dan jenis tiket. Setelah tengah malam, cek jadwal khusus bus malam dan lokasi halte keberangkatan, terutama jika penerbangan baru mendarat mendekati akhir jam operasi kereta.",
    ],
    steps: [
      {
        title: "Tandai hotel dan pintu masuknya",
        body: "Bandingkan jarak dari Kowloon atau Hong Kong Station dengan jarak dari halte bus terdekat.",
      },
      {
        title: "Cek tarif dan jadwal perjalanan lanjutan",
        body: "Bandingkan harga total dan jumlah perpindahan, termasuk jika harus naik MTR atau taksi setelah turun.",
      },
      {
        title: "Simpan pilihan jika mendarat larut",
        body: "Catat rute bus malam atau lokasi antre taksi resmi sebelum penerbangan. Jangan menyamakan jam kereta terakhir tiap stasiun.",
      },
    ],
    faqs: [
      {
        question: "Berapa lama Airport Express dari bandara ke Central?",
        answer:
          "MTR mencantumkan sekitar 24 menit hingga Hong Kong Station. Waktu berjalan atau sambungan dari stasiun ke tujuan di Central dihitung terpisah.",
      },
      {
        question: "Apakah Airport Express langsung ke Tsim Sha Tsui?",
        answer:
          "Tidak. Cek sambungan dari Kowloon Station, atau cari rute bus bandara dengan halte yang lebih dekat ke hotel.",
      },
      {
        question: "Ada bus malam dari bandara Hong Kong?",
        answer:
          "Ada beberapa rute malam. Periksa daftar terbaru dari Hong Kong International Airport dan cek halte yang paling dekat dengan tujuanmu.",
      },
    ],
    keywords: [
      "bandara Hong Kong ke kota",
      "Hong Kong Airport Express atau bus",
      "bandara Hong Kong ke Tsim Sha Tsui",
    ],
    sources: [
      {
        label: "MTR Hong Kong — Jadwal dan durasi Airport Express",
        url: "https://www.mtr.com.hk/en/customer/services/timetable_index.html",
      },
      {
        label: "MTR Hong Kong — Tarif dan pilihan tiket Airport Express",
        url: "https://www.mtr.com.hk/en/customer/tickets/tf_index.html",
      },
      {
        label: "Hong Kong International Airport — Pilihan transportasi bandara",
        url: "https://www.hongkongairport.com/en/transport/to-from-airport/",
      },
    ],
    relatedDestinations: [{ code: "hk", label: "Lihat paket eSIM Hong Kong" }],
    relatedLinks: [
      { guide: "cara-memasang-esim-sebelum-berangkat", label: "Siapkan eSIM sebelum terbang" },
      {
        guide: "suvarnabhumi-ke-bangkok-airport-rail-link",
        label: "Cara memilih kereta bandara di Bangkok",
      },
    ],
  },
  {
    slug: "taoyuan-airport-ke-taipei-main-station-mrt",
    title: "Taoyuan Airport ke Taipei: Jangan Salah Pilih Kereta MRT",
    description:
      "Dari Terminal 1 atau 2, pilih Airport MRT Express atau Commuter. Cek tarif, arah Taipei Main Station, dan sambungan menuju hotel.",
    eyebrow: "TRANSPORTASI TAIWAN",
    heading: "Taoyuan Airport ke Taipei Main Station naik MRT yang mana?",
    publishedAt: PUBLISHED,
    updatedAt: PUBLISHED,
    readTime: "3 menit baca",
    image: "/assets/guides/taoyuan-airport-mrt.jpg",
    imageAlt: "Ilustrasi kereta Taoyuan Airport MRT melintas di jalur layang saat matahari terbit",
    summary:
      "Dari Taoyuan Airport, naik Airport MRT arah Taipei Main Station (A1) dari Terminal 1 (A12) atau Terminal 2 (A13). Express berhenti di lebih sedikit stasiun. Commuter cocok untuk stasiun lokal yang dilewati Express dan dapat menjadi pilihan jika berangkat lebih dulu. Tarif kedua layanan untuk ruas yang sama setara.",
    paragraphs: [
      "Kereta pertama yang muncul di layar menuju Taipei belum tentu pilihan terbaik, tetapi menunggu Express juga tidak otomatis memangkas waktu. Lihat perkiraan jam tiba di A1. Jika Express segera datang, pilih itu untuk mengurangi jumlah perhentian. Jika hotel dekat stasiun lokal yang dilewatinya, cek Commuter agar kamu tidak perlu berbalik arah.",
      "Dari Terminal 1, cari Airport MRT A12. Dari Terminal 2, cari A13. Pada papan keberangkatan, pastikan kereta menuju Taipei Main Station (A1), terutama karena jalur yang sama juga melayani arah sebaliknya. Siapkan tiket sekali jalan dari mesin stasiun atau metode pembayaran yang didukung gerbang.",
      "Taoyuan Metro menetapkan tarif berdasarkan ruas perjalanan, sehingga Express dan Commuter membebankan tarif yang sama untuk titik asal dan tujuan yang sama. Tarif reguler A1 ke stasiun terminal adalah NT$160 menurut operator. Bandingkan tarif terkini dan tambahkan ongkos Taipei Metro jika perlu pindah ke jalur kota.",
      "Di A1, kamu masih perlu berjalan ke bagian stasiun yang sesuai untuk Taipei Metro, kereta reguler, atau Taiwan High Speed Rail. Cari pintu keluar dari alamat hotel. Jika akan mengejar kereta lanjutan, beri jeda yang cukup untuk lorong penghubung, lift, dan kemungkinan antre. Saat tiba larut, cek jadwal terakhir dari terminalmu sebelum memilih kereta.",
    ],
    steps: [
      {
        title: "Catat kode Terminal 1 atau Terminal 2",
        body: "Gunakan A12 untuk Terminal 1 dan A13 untuk Terminal 2. Ikuti papan Airport MRT ke peron yang benar.",
      },
      {
        title: "Cocokkan tujuan dan jam tiba",
        body: "Untuk Taipei Main Station, cari arah A1. Untuk stasiun antara, cek apakah Express berhenti di sana atau perlu naik Commuter.",
      },
      {
        title: "Simpan jalur dari A1 ke tujuan akhir",
        body: "Simpan nama stasiun lanjutan, pintu keluar, dan alamat hotel dalam bahasa Inggris atau Mandarin. Tambahkan waktu berjalan jika membawa koper.",
      },
    ],
    faqs: [
      {
        question: "Apakah Express dan Commuter Airport MRT beda harga?",
        answer:
          "Tarifnya sama untuk titik asal dan tujuan yang sama. Yang berbeda adalah jumlah pemberhentian dan waktu tempuh.",
      },
      {
        question: "Dari Taoyuan Terminal 2 naik MRT di stasiun apa?",
        answer:
          "Cari Airport Terminal 2 Station (A13). Pilih arah Taipei Main Station (A1) jika kamu menuju pusat Taipei.",
      },
      {
        question: "Apa Taipei Main Station Airport MRT sama dengan Taipei Metro?",
        answer:
          "A1 adalah bagian dari jaringan Taoyuan Airport MRT. Ikuti lorong dan papan penghubung jika akan pindah ke jaringan Taipei Metro atau kereta lain.",
      },
    ],
    keywords: [
      "Taoyuan Airport ke Taipei",
      "Taipei Airport MRT Express vs Commuter",
      "Taoyuan MRT Taipei Main Station",
    ],
    sources: [
      {
        label: "Taoyuan Metro — Jadwal Terminal 1 dan jenis kereta",
        url: "https://www.tymetro.com.tw/tymetro-new/en/_pages/travel-guide/timetable-A12",
      },
      {
        label: "Taoyuan Metro — Perbandingan tarif Express dan Commuter",
        url: "https://www.tymetro.com.tw/tymetro-new/en/_pages/service/FAQ.php?page=5&v=10",
      },
      {
        label: "Taoyuan Metro — Panduan stasiun Terminal 2",
        url: "https://www.tymetro.com.tw/tymetro-new/en/_pages/travel-guide/dep-A13",
      },
      {
        label: "Taoyuan Metro — Tarif reguler bandara ke Taipei Main Station",
        url: "https://www.tymetro.com.tw/tymetro-new/tw/_pages/service/FAQ.php?v=57",
      },
    ],
    relatedDestinations: [{ code: "tw", label: "Lihat paket eSIM Taiwan" }],
    relatedLinks: [
      { guide: "cara-memasang-esim-sebelum-berangkat", label: "Pasang eSIM sebelum berangkat" },
      {
        guide: "incheon-ke-seoul-arex-express-all-stop",
        label: "Bandingkan juga dua kereta bandara Seoul",
      },
    ],
  },
];
