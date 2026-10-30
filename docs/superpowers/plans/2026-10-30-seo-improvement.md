# Rencana peningkatan SEO Djiwa Travel

Tanggal: 30 Oktober 2026. Status: implementasi awal sudah dibuat; pekerjaan pengukuran dan validasi eksternal masih terbuka.

## Tujuan dan asumsi

Meningkatkan kunjungan organik berkualitas dan pembelian eSIM oleh traveler Indonesia. Fokus awal Google Search berbahasa Indonesia dan mobile. Prioritas destinasi di bawah adalah usulan; urutan final mengikuti data permintaan, penjualan, ketersediaan, dan margin yang dianalisis secara internal.

Scope: Djiwa Travel, repo `/Users/apple/Documents/djiwatravel`, branch `main`, origin `https://djiwatravel.com`. Tidak mencakup ASO App Store atau perubahan Djiwa Pay. Database, service, dan VPS tidak diakses dalam audit ini. Tidak ada migrasi yang direncanakan saat ini.

## Bukti kondisi awal

Inspeksi source dan GET publik tanggal 30 Oktober 2026:

- Beranda, robots.txt, sitemap.xml, destinasi Jepang, dan indeks panduan memberi HTTP 200. Destinasi Jepang berakhir di `?availability=all`, dengan canonical tanpa query; audit redirect ini sebelum memutuskan perubahan.
- Sitemap saat sampel berisi 2.904 URL, termasuk 2.694 `/plan/*`. Ini jumlah URL yang dikirim, bukan jumlah yang diindeks Google; isi dapat berubah mengikuti katalog.
- Canonical dan structured data sudah tersedia. Beranda memiliki Organization dan WebSite; paket memiliki Product dan Breadcrumb; panduan memiliki Article.
- Ada tiga panduan editorial di `src/lib/travel-guides.ts`.
- Judul beranda publik adalah `Djiwa Travel — Mau pergi ke mana?`; H1 `Mau pergi ke mana?`. Peluang memperjelas proposisi eSIM tanpa menghilangkan karakter brand.
- `public/robots.txt` memiliki grup Googlebot/Bingbot yang hanya mengizinkan `/`; pembatasan `/admin` dan `/api/` berada di grup wildcard. Grup spesifik perlu dibereskan karena tidak mewarisi grup wildcard.
- Checkout memakai `{ property: "robots", content: "noindex" }`; perlu dinormalisasi ke `name: "robots"` dan diverifikasi pada HTML respons.
- Sitemap mengubah kegagalan pengambilan paket menjadi daftar kosong dan menyimpan respons satu jam. Ini risiko sitemap menyusut saat provider bermasalah, bukan bukti kegagalan yang sedang terjadi.
- Halaman destinasi membuat Product untuk banyak paket dengan Offer URL menuju checkout; evaluasi penggunaan daftar/ItemList dan Product pada halaman detail paket.
- Belum ada akses data Search Console, data performa pengguna nyata, atau laporan atribusi pembelian. Tidak ada klaim ranking, volume keyword, atau kenaikan trafik.

## Pilihan strategi

1. Technical SEO saja: memperbaiki crawl dan indexability, tetapi belum mengembangkan permintaan dan konten.
2. Technical SEO + destinasi komersial + panduan pendukung: rekomendasi karena memakai route dan katalog yang sudah ada serta menghubungkan pencarian ke pembelian.
3. Ekspansi massal halaman programatik: tunda sampai kualitas dan indexability terbukti; menambah URL serupa belum tentu menambah nilai.

Rekomendasi ini belum merupakan pilihan yang disetujui user. Jadwal berikut adalah estimasi urutan kerja, bukan janji hasil ranking.

## Roadmap 90 hari

### P0 — Minggu 1–2: baseline dan kendali indexing

Owner: engineering, dibantu pemilik akses Search Console/analytics.

- [ ] Verifikasi properti Search Console dan submission sitemap; ekspor baseline 28 hari dan pembanding sebelumnya bila tersedia. Pisahkan branded/non-branded, mobile/desktop, serta halaman destinasi/paket/panduan.
- [x] Inventarisasi analytics yang ada di `src/lib/analytics.ts`; route paket publik sudah masuk allowlist analytics. Event checkout_start mencatat path paket publik tanpa data pelanggan; funnel pembayaran terverifikasi belum terukur. Definisikan funnel landing organik → lihat paket → mulai checkout → pembayaran terverifikasi. Dedup pembelian; jangan kirim email, telepon, token, atau data pelanggan ke analytics.
- [ ] Buat matriks route: index untuk storefront/destinasi/paket/panduan yang layak; noindex untuk login, checkout, order, receipt, wallet, profil, My Trips, dan admin sesuai kebutuhan masing-masing route. Auth tetap wajib untuk data pribadi.
- [x] Rapikan grup robots; bedakan pembatasan crawl dengan noindex. URL yang perlu dibaca noindex-nya tidak boleh sekaligus diblokir crawl tanpa strategi penghapusan indeks.
- [x] Normalisasi meta robots checkout. Periksa noindex yang sudah ada sebelum menambah aturan global agar halaman komersial tidak ikut tertutup.
- [ ] Audit sitemap terhadap canonical, status HTTP, link internal, availability, timeout, dan paket yang hilang sementara. Rancang snapshot sitemap terakhir yang valid atau respons gagal yang jelas, bukan sukses kosong saat gangguan; kebijakan cache harus membatasi umur data stok.
- [ ] Audit varian HTTP/HTTPS, www/non-www, case kode, trailing slash, dan query filter. Pertahankan URL lama; jangan mengganti slug massal. Perbaiki default query redirect hanya jika bukti menunjukkan kebutuhan.

Files utama: `public/robots.txt`, `src/routes/checkout.$id.tsx`, `src/routes/sitemap[.]xml.ts`, `src/lib/seo-indexability.server.ts`, `src/lib/canonical-host.ts`, `src/lib/analytics.ts`, route privat yang hasil auditnya memerlukan perubahan.

Kriteria selesai: sampel tiap kelas route memiliki keputusan index yang eksplisit; URL sitemap yang disampel memberikan 200 dan canonical yang konsisten; tidak ada URL privat di sitemap; simulasi timeout tidak menghasilkan sitemap sukses yang kehilangan seluruh paket.

### P1 — Minggu 3–4: landing page yang menjawab niat beli

Owner: engineering + penanggung jawab produk/konten.

- [ ] Pilih 5–10 destinasi awal berdasarkan data. Kandidat: Jepang, Singapura, Malaysia, Korea Selatan, Thailand, Arab Saudi, dan Eropa.
- [ ] Petakan satu niat pencarian utama ke satu landing utama. Contoh hipotesis: `eSIM Jepang` → `/destination/jp`; kebutuhan kuota/durasi spesifik → halaman paket; cara pasang → panduan. Validasi keyword sebelum finalisasi judul.
- [x] Perjelas title dan description beranda: produk, pasar traveler Indonesia, serta manfaat yang benar-benar tersedia. Contoh usulan title: `eSIM Internasional untuk Traveler Indonesia | Djiwa Travel`.
- [x] Tambahkan ringkasan pemilihan paket pada landing destinasi dan gunakan ItemList schema untuk link paket; konten fakta spesifik cakupan/aktivasi tetap harus diverifikasi per provider. pilihan kuota/durasi, cakupan yang terverifikasi, kapan masa aktif dimulai, tethering/FUP jika diketahui, kompatibilitas perangkat, instalasi, bantuan dan refund. Jangan mengarang operator, kecepatan, unlimited, atau harga termurah.
- [ ] Gunakan harga mulai dari hanya dari paket tersedia; saat stok/harga tidak diketahui tampilkan keadaan netral. Pertahankan konten destinasi yang berguna saat kehabisan sementara; paket permanen dihapus memakai 404/410 atau redirect hanya ke pengganti yang setara.
- [ ] Hubungkan beranda → destinasi → halaman paket → checkout dengan link HTML yang dapat diikuti crawler. Audit pagination/tombol muat lebih banyak agar paket bernilai tidak hanya ditemukan melalui sitemap.
- [ ] Audit structured data: Product/Offer detail sesuai harga dan stok yang terlihat; breadcrumb konsisten; pertimbangkan ItemList untuk daftar. Jangan menambah review/rating fiktif atau menjanjikan rich result.

Files utama: `src/routes/index.tsx`, `src/routes/destination.$code.tsx`, `src/routes/plan.$id.tsx`, `src/lib/seo.ts`; usulan data editorial terpisah di `src/lib/destination-content.ts` agar konten tidak menambah kompleksitas route.

Kriteria selesai: 5–10 landing memiliki konten relevan yang tampil pada HTML awal tanpa login; title/H1 sesuai tujuan; link paket menuju halaman publik; schema lolos pemeriksaan relevan dan selaras dengan UI; alur beli tetap berfungsi.

### P1 — Minggu 5–6: performa mobile

Owner: engineering.

- [ ] Ukur beranda, destinasi, paket, dan panduan dengan PageSpeed Insights/Lighthouse; bandingkan dengan data lapangan Search Console/CrUX bila tersedia. Jangan menyamakan skor lab dengan pengalaman pengguna nyata.
- [ ] Profilkan waktu loader katalog dan sellability. Optimalkan cache/batching sesuai bukti, dengan batas freshness dan perilaku gagal yang tidak mengiklankan stok palsu.
- [ ] Optimalkan gambar utama, ukuran gambar eksplisit, format modern, font, JavaScript awal, serta animasi yang menyebabkan layout shift atau interaksi lambat.
- [ ] Periksa splash/onboarding untuk pengunjung tanpa login dan konten HTML publik. Pertahankan kontrak onboarding pelanggan yang berlaku.

Files potensial: `src/routes/__root.tsx`, route destinasi/paket, `src/lib/reseller-catalog-cache.ts`, `src/lib/seo-indexability.server.ts`, komponen gambar/splash yang profilnya menunjukkan masalah. Perubahan hanya setelah pengukuran.

Target pengalaman mobile persentil 75: LCP ≤2,5 detik, INP ≤200 ms, CLS ≤0,1. Jika trafik belum cukup untuk field data, gunakan hasil lab sebagai alat diagnosis dan mulai pengukuran pengguna nyata.

### P2 — Minggu 7–10: konten pendukung dan kepercayaan

Owner: konten/produk; engineering untuk kebutuhan template.

- [x] Tambahkan dua panduan orisinal untuk persiapan pemasangan eSIM dan pemilihan kuota; rencanakan sekitar dua artikel bermutu per minggu sesuai kapasitas review.
- [ ] Prioritaskan pertanyaan dekat pembelian: instalasi iPhone/Android, cek kompatibilitas, kapan aktivasi, kebutuhan kuota 7/14 hari, roaming versus eSIM, dan koneksi saat umrah.
- [ ] Tambahkan penulis/reviewer, tanggal pembaruan yang benar, screenshot sendiri tanpa data pribadi, referensi vendor resmi, dan link ke destinasi terkait.
- [ ] Lengkapi informasi bisnis, kontak bantuan, refund, privasi, dan syarat layanan. Gunakan bukti operasional nyata; jangan membuat testimoni atau klaim pengalaman palsu.
- [ ] Bangun kerja sama editorial dengan komunitas traveler/agen perjalanan yang relevan. Hindari pembelian link dan publikasi massal bernilai rendah.

Files utama: `src/lib/travel-guides.ts`, `src/routes/panduan.$slug.tsx`, `src/routes/panduan.index.tsx`, `src/routes/support.tsx`, `src/routes/privacy.tsx`, `src/routes/terms.tsx`; halaman bisnis baru hanya jika audit menemukan kebutuhan nyata.

Kriteria selesai: setiap artikel menjawab kebutuhan berbeda, ditinjau faktanya, memiliki tujuan internal link yang relevan, dan tercantum dalam sitemap saat layak indeks.

### P2 — Minggu 11–12: evaluasi dan perluasan

Owner: produk + konten + engineering.

- [ ] Bandingkan periode 28 hari dengan periode setara; catat musim perjalanan, perubahan stok, dan tanggal rilis.
- [ ] Prioritaskan halaman berimpression tinggi dengan CTR rendah; evaluasi title/snippet berdasarkan query, perangkat, dan posisi.
- [ ] Gunakan landing dengan kunjungan tetapi checkout rendah untuk mengevaluasi kejelasan paket, harga, kompatibilitas, dan CTA.
- [ ] Perluas konten/destinasi yang terbukti membawa permintaan dan pembelian; gabungkan konten tumpang tindih hanya dengan bukti.

## Ukuran keberhasilan

Metrik bisnis utama: pembelian dibayar dan pendapatan dari kanal organik, dengan atribusi dan dedup yang terdokumentasi. Metrik pendukung: klik non-brand, impression query target, CTR per kelompok query/posisi, indexability halaman prioritas, conversion rate organik, dan Core Web Vitals.

Target deliverable 30 hari: baseline tersedia, celah robots/noindex ditangani, audit sitemap selesai, 5–10 landing prioritas ditingkatkan. Target pertumbuhan klik/penjualan 60–90 hari ditetapkan setelah baseline; tidak ada jaminan posisi pertama atau semua URL terindeks.

## Verifikasi implementasi dan release

- Sebelum perubahan: baca route, loader/server module, dan test terkait; catat baseline.
- Perluas test perilaku SEO untuk pemilihan grup crawler, markup robots yang benar, canonical/query, sitemap saat provider timeout, serta schema/harga/availability yang sesuai tampilan. Test source-string yang sudah ada belum membuktikan perilaku HTTP atau indeks Google.
- Mulai dengan `npm test -- src/test/seo-product-ranking.test.ts`, lalu test relevan yang ditambah; jalankan `npm test` dan `npm run build` untuk perubahan aplikasi. Bandingkan kegagalan dengan baseline, jangan menganggap semua kegagalan regresi.
- Verifikasi HTML respons aktual, redirect/status/header, hasil Rich Results Test, dan URL Inspection setelah rilis; pengujian lokal tidak membuktikan indeks produksi.
- Deploy hanya ketika diminta, mengikuti `scripts/deploy-vps.sh` dan `scripts/autodeploy.sh`. Pisahkan bukti commit, artifact, service/listener, localhost, publik, dan rollback.

## Sumber pedoman

- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Pemilihan grup robots.txt](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec)
- [Noindex dan kebutuhan akses crawler](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [Pembuatan sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Core Web Vitals](https://web.dev/articles/vitals)

## Status implementasi (worktree `codex/seo-improvement`)

- Selesai: aturan crawler Googlebot/Bingbot, `noindex` checkout dan My Trips, metadata beranda, analytics allowlist halaman paket, dan sitemap yang gagal jelas ketika paket katalog tidak dapat dimuat (alih-alih sukses dengan daftar paket kosong).
- SEO contract dan travel guide tests: 14 lulus. `git diff --check` bersih.
- SEO, panduan, dan share focused tests: 19 lulus. `npm run build` berhasil setelah memakai dependency tree yang sudah tersedia di checkout utama; manifest dan lockfile tidak diubah.
- Full `npm test` masih gagal pada test eSIM Finder, wallet UI, customer auth, offline snapshot, travel support, checklist, dan guest-order access; proses dihentikan setelah suite berhenti menghasilkan output. Kegagalan ini belum dibandingkan pada baseline yang bersih karena checkout utama memiliki perubahan lokal lain.
- Belum selesai: Search Console/submission dan baseline metrik (akses properti tidak tersedia); audit Core Web Vitals dan optimasi hasil profil; validasi editorial dan pengayaan fakta spesifik halaman destinasi; instrumentasi pembelian organik terverifikasi; uji URL Inspection/Rich Results produksi.
- Status release saat catatan ini diperbarui: source lokal sudah siap diverifikasi dan dirilis; commit, merge, push, deploy, serta pemeriksaan publik masih menunggu langkah integrasi.
