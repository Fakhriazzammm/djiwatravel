# Rencana: Travo "Rencana lengkap"

Status: **rencana, belum ada kode**. Dibuat 2026-11-10 dari diskusi dengan pemilik produk.
Aturan repo (AGENTS.md) berlaku: setiap tahap dikirim end-to-end (UI pelanggan, kontrol Admin,
server, migrasi, tes), AI hanya **mengusulkan** dan traveler yang menerapkan, rahasia tetap di server.

## 1. Tujuan

Travo membuat itinerary penuh dengan sumber daya milik kita, bukan karangan model:

- harga tiket pesawat tercatat, anggaran dan strategi keuangan, kebutuhan dan persiapan;
- paket eSIM tujuan, cuaca, panduan;
- **destinasi nyata dari titik di peta**: atraksi, makan siang dan malam, kafe, belanja, tersusun per hari
  menurut kedekatan, dengan pin di peta.

Prinsip: **server mengambil data, AI menyusun.** Setiap angka berlabel sumbernya.

## 2. Keputusan produk (sudah disepakati)

| # | Keputusan |
|---|---|
| 1 | Kota asal jadi **kolom saat membuat trip** (dan bisa diedit). |
| 2 | Biaya harian **dibuat AI**, disimpan per kota, dengan pagar kewajaran, bisa diedit di Admin. |
| 3 | Hotel: **perkiraan berlabel** dulu, tanpa tombol booking. |
| 4 | Tamu (freemium) mendapat "Rencana lengkap" **satu kali**; member sesuai kuota Admin. |
| 5 | Destinasi diambil **dari titik di peta** (makanan, atraksi, dll.), bukan dikarang. |
| 6 | Rencana lengkap bisa jadi **Google Spreadsheet milik user** yang sudah terhubung, **satu file** dengan anggaran dan pengeluaran (bukan file baru), tersinkron dua arah untuk bagian uangnya. |
| 7 | Google Drive: **folder trip + dokumen "Rencana perjalanan" dibuat otomatis** setiap rencana diterapkan (bagian 8b). |
| 8 | **Itinerary di Sheets dua arah** (jam, judul, tanggal, catatan, biaya bisa diedit dari sheet), dengan pagar di 8b. |

Belum diputuskan: cakupan awal (usulan: Jepang dan beberapa kota populer dulu, kota lain versi sederhana).

## 3. Yang sudah ada (diverifikasi di kode)

| Sumber | Lokasi |
|---|---|
| Harga tiket tercatat (Travelpayouts, cache, bukan real-time) | `src/lib/flights.server.ts`: `fetchMonthOffers`, `searchFlightsHandler`, `searchFlightIdeasHandler` |
| Pencarian kota/bandara | `src/components/flight-place-field.tsx`, `searchFlightPlacesHandler` |
| Simpan tiket ke Agenda | `flight-features.server.ts` ("Simpan ke perjalanan") |
| Paket eSIM per tujuan | `esim-home-catalog.server.ts`, `/destination/<ISO2>` |
| Cuaca trip | `trip-weather.server.ts` |
| Panduan (16) | `src/lib/travel-guides.ts` |
| Katalog Titip Belanja | `shopping_catalog_items` |
| Pembagian anggaran, konversi kurs | `budget-split.ts`, `expense-items*.ts` |
| Google Drive + Sheets per trip (sinkron dua arah anggaran/pengeluaran/rincian, folder `Djiwa Travel/<trip>`, scope `drive.file`, format otomatis) | `google-account.server.ts`, `google-drive.server.ts`, `google-sheets.server.ts`, `google-sheets-model.ts`, `google-sheets-pull.server.ts`, `trip-google-cards.tsx`, `google-consent-sheet.tsx` |
| Nominatim + jam buka OSM + pin | `trip-assistant-places.server.ts`, `opening-hours.ts` |
| Proposal (apply/undo), blok UI, share, kuota, tamu | `trip-assistant*.ts`, `trip-assistant-blocks`, `guest-trips.server.ts` |

Belum ada: sumber harga hotel, kota asal di trip, patokan biaya harian, pencari tempat dari peta.

## 4. Arsitektur

```
Traveler ──"Rencana lengkap"──▶ runTurn (intent: full_plan)
                                   │
                  ┌────────────────┴─────────────────┐
                  ▼                                  ▼
        buildTripResearch(tripId)           buildPlaceCandidates(trip)
        (paket fakta, tiap sumber           (kandidat tempat dari peta,
         punya saklar + timeout)             diklaster per hari)
                  └────────────────┬─────────────────┘
                                   ▼
                   prompt (fakta + kandidat, bertanda sumber)
                                   ▼
                   model generasi (JSON skema ketat)
                                   ▼
        cleanFullPlan: validasi, buang tempat di luar kandidat,
        cek jam buka, label angka (tercatat/perkiraan/dari Anda)
                                   ▼
        paket usulan: Agenda · Anggaran · Checklist · Strategi
        (kartu terpisah, diterapkan sebagian, Urungkan per kartu)
```

### 4.1 Paket fakta (`buildTripResearch`)
File baru `src/lib/trip-research.server.ts` (+ bagian murni `trip-research.ts`).
Mengumpulkan, masing-masing dengan `source`, `asOf`, dan timeout 4 detik:

- **Tiket:** termurah tercatat kota asal → tujuan untuk tanggal trip, plus saran tanggal hemat dari
  kalender harga bulanan. Label "harga terendah tercatat, cek lagi saat beli", tautan `/tiket`.
- **eSIM:** 2 sampai 3 paket yang cocok untuk negara dan jumlah hari, harga kita.
- **Cuaca, panduan relevan** (mis. tax refund Jepang), **kurs** ke IDR.
- **Patokan harian** kota (bagian 4.3).
- **Titip Belanja:** hanya bila traveler menyebut oleh-oleh atau belanja.

Satu sumber gagal tidak menggagalkan rencana; rencana mencatat "data X tidak tersedia".
Ukuran dibatasi (±3 KB JSON) agar biaya model terkendali.

### 4.2 Kota asal
- Migrasi `060_trip_origin.sql`: `travel_trips.origin_name text`, `origin_code text` (IATA), nullable.
- Form "Perjalanan baru" dan "Edit trip": kolom "Berangkat dari" memakai `FlightPlaceField`.
- `duplicateTripRecord` menyalinnya; Admin melihatnya di detail trip.
- Trip lama tanpa kota asal: Travo bertanya sekali lewat chip, menyimpannya, lalu lanjut.

### 4.3 Patokan biaya harian per kota
- Migrasi `061_city_cost_baselines.sql`: tabel `travel_city_costs` (kota/negara, mata uang, `meal_budget`,
  `meal_mid`, `local_transport_day`, `attractions_day`, `hotel_budget`, `hotel_mid`, `source` = `ai|admin`,
  `generated_at`, `version`).
- **Dibuat AI sekali per kota** (model generasi, ±Rp30), disimpan, dipakai ulang.
- **Pagar kewajaran** (fungsi murni, diuji): batas min/maks per kategori per kelas biaya hidup,
  rasio antar kategori (mid ≥ budget, hotel ≥ makan sehari, dst.), angka di luar batas dibuang dan
  dibuat ulang maksimal 2 kali, lalu jatuh ke tabel bawaan konservatif.
- Semua angka tampil **"perkiraan"** dengan tanggal. Angka hasil edit Admin (`source=admin`) tidak
  pernah ditimpa oleh pembuatan ulang otomatis.
- Tidak mengambil dari situs pihak ketiga (syarat penggunaan tidak jelas).

### 4.4 Kandidat tempat dari peta (`buildPlaceCandidates`)
File baru `src/lib/trip-places.server.ts` (+ `trip-places.ts` murni).

1. **Sumber:** OpenStreetMap lewat Overpass (atau Nominatim bila Overpass tak terjangkau), area dari kota
   trip (`tripAnchor` sudah ada). Kategori: `amenity=restaurant|cafe|food_court|fast_food`,
   `tourism=attraction|museum|gallery|viewpoint`, `leisure=park`, `shop=mall|department_store`,
   `historic=*`. Hasil: nama, koordinat, tipe, `opening_hours`, situs bila ada.
2. **Cache:** tabel `travel_place_cache` (kota, kategori, hasil, `fetched_at`, TTL 7 hari). Permintaan
   ke layanan peta tidak dibuat per jawaban.
3. **Filter:** buang tanpa nama, tanpa koordinat, duplikat dekat, dan yang jelas tidak relevan.
4. **Klaster per hari:** k-means sederhana pada koordinat atraksi menjadi N hari; makan siang dan malam
   dipilih dari kandidat makanan terdekat ke pusat klaster hari itu; jarak (haversine) dan perkiraan
   waktu tempuh dihitung.
5. **Batas input model:** maksimal ±60 kandidat total, terurut skor (kelengkapan data, kedekatan,
   keragaman tipe).
6. **Tidak ada klaim "terbaik":** OSM tidak punya rating. Label "pilihan Travo", dan model hanya boleh
   memilih dari daftar (id kandidat), bukan menulis nama baru.

Risiko yang dicek **sebelum** membangun: jangkauan Overpass/Nominatim dari VPS Travel (Photon pernah
tidak terjangkau). Hasil cek menentukan sumber dan cache.

### 4.5 Skema jawaban dan validasi
Perluas `ASSISTANT_REPLY_SCHEMA` / skema khusus `full_plan`:

- `days[]`: `date`, `items[]` (`candidateId`, `slot` sarapan/pagi/makan_siang/sore/makan_malam,
  `start`, `end`, `note`, `estCostMinor`), `budgetNote`.
- `budget`: `categories[]` dengan `basis` (`tercatat|perkiraan|input`).
- `strategy[]`: `{title, saving?, body}` (mis. tanggal tiket lebih murah, eSIM vs roaming).
- `checklist[]` dengan tenggat dari tanggal berangkat.

`cleanFullPlan` (murni, diuji): buang item yang `candidateId` tidak ada; cek jam buka; hari penuh
dibatasi (maks 6 item); total biaya vs anggaran traveler dihitung ulang di server (model tidak
dipercaya menjumlah); angka tanpa dasar diberi `basis: perkiraan`.

### 4.6 Kartu dan UI
Blok baru di `assistant-blocks.tsx` / kartu di `trip-assistant-cards.tsx`:

- **Kartu Agenda per hari** dengan ikon tipe (makan/atraksi/belanja), jarak antar titik, peringatan jam buka.
  Tombol **"Ganti tempat ini"** menawarkan 2 sampai 3 alternatif terdekat dari kandidat (tanpa panggilan model).
- **Kartu Anggaran** dengan bar, label sumber (tercatat/perkiraan), dan sisa terhadap anggaran.
- **Kartu Strategi keuangan** (blok `money`): saran bernilai Rp, mis. "geser 2 hari, hemat Rp X".
- **Kartu Checklist** persiapan spesifik tujuan.
- **Kartu Tiket/eSIM:** tombol "Lihat di Tiket" (tautan `/tiket` terisi) dan "Simpan ke perjalanan", serta
  paket eSIM terkait. Travo tidak menjual atau membayar apa pun.
- Terapkan sebagian per kartu; Urungkan per kartu (mekanisme proposal yang ada). Pin dipasang dari
  koordinat kandidat (`pinMissingPlaces` hanya sebagai cadangan).
- Chip baru **"Rencana lengkap"** di baris aksi cepat dan di kartu "Ringkas semua".

### 4.7 Kuota dan tamu
- Intent `full_plan` memakai model generasi; dihitung **2 sampai 3 pesan** dari kuota harian member (Admin bisa ubah).
- **Tamu: 1 kali seumur cookie tamu**, dicatat di `travel_assistant_runs` (kolom `kind='full_plan'`
  per subject). Setelah dipakai: ajakan masuk/daftar. Rencana yang sudah dibuat tetap bisa diterapkan.
- Burst/in-flight limit yang ada tetap berlaku.

## 5. Admin (Admin › Travo)

- Saklar per sumber: tiket, eSIM, cuaca, panduan, kandidat peta, patokan harian.
- Tabel patokan biaya per kota (lihat, edit, "Buat ulang", versi, log audit).
- Pengaturan tamu: izinkan/tidak, jumlah (default 1).
- Bobot kuota "Rencana lengkap", batas biaya per rencana, kota yang diizinkan (Jepang dulu).
- Statistik: jumlah rencana, rata-rata biaya model, sumber yang gagal, rasio diterapkan.
- Pengaturan lewat `admin_settings` bersaksi versi dan log audit (pola `tripAssistant` yang ada).

## 6. Migrasi

| No | Isi |
|---|---|
| 060 | `travel_trips.origin_name`, `origin_code` |
| 061 | `travel_city_costs` |
| 062 | `travel_place_cache` + `travel_assistant_runs.kind` (+ indeks per subject untuk kuota tamu) |
| 063 | Tab rencana di Sheets + dokumen rencana di Drive (aditif, lihat 8b) |

Semua aditif. Rollback = rollback aplikasi, data dipertahankan. Terapkan ke produksi sebelum deploy.

## 7. Tahap kerja dan kriteria selesai

| Tahap | Isi | Selesai bila |
|---|---|---|
| 0 | Cek jangkauan Overpass/Nominatim dari VPS; ukur biaya prompt kasar; tunggu pekerjaan multi-topik masuk `main` | Keputusan sumber kandidat tercatat |
| 1 | Migrasi 060, kolom kota asal (form, edit, duplikat, Admin) | Trip baru menyimpan kota asal; tes + produksi |
| 2 | Paket fakta + patokan harian (+ pagar, Admin tabel) | Satu kota Jepang menghasilkan patokan wajar; sumber gagal tidak merusak |
| 3 | Kandidat tempat + klaster + cache | Tokyo/Osaka menghasilkan klaster per hari dengan makanan terdekat |
| 4 | Intent "Rencana lengkap", skema, `cleanFullPlan`, kartu, Ganti tempat, kuota tamu | Rencana penuh dengan pin di peta, bisa diterapkan sebagian dan diurungkan |
| 5 | Google Sheets: tab Ringkasan/Itinerary/Persiapan/Tiket & Transport, kolom Perkiraan Travo, layout v3 + migrasi file lama | Setelah Terapkan, sheet user terisi rapi dan angkanya ikut berubah saat mencatat pengeluaran |
| 6 | Google Drive: dokumen rencana ke folder trip, tombol di kartu, saklar Admin | Dokumen terbuat di folder trip user, putus koneksi menghentikan semuanya |
| 7 | Admin: saklar, statistik, pengaturan tamu | Semua dapat dikontrol dan tercatat di audit |
| 8 | Uji akhir produksi (AI asli, akun tamu dan akun terhubung Google, trip uji dihapus) | Laporan hasil + status local/commit/push/deploy terpisah |

Tiap tahap: tes unit (fungsi murni), tes integrasi Postgres (migrasi, kuota tamu, cache), tes UI jsdom,
`djiwa gate`, lalu ship dan cek publik. Kepadatan UI mengikuti `djiwa-mobile-ui` dan
`mobile-compact-scale.test.ts`.

## 8. Risiko

| Risiko | Mitigasi |
|---|---|
| Harga tiket bukan real-time | Label jelas, tautan ke pencarian, tanggal data |
| Tidak ada data hotel | Perkiraan berlabel; sumber hotel jadi tahap terpisah |
| Overpass tak terjangkau/lambat | Cache per kota, fallback Nominatim, tahap 0 memastikan lebih dulu |
| OSM tanpa rating, kota kecil tipis | Label "pilihan Travo", terus terang bila kandidat kurang |
| Angka AI tidak masuk akal | Pagar kewajaran, hitung ulang total di server, edit Admin menang |
| Biaya model naik | Patokan dibuat sekali per kota, batas ukuran prompt, bobot kuota, batas harian Admin |
| Penyalahgunaan tamu | Satu kali per cookie, burst limit, Admin dapat mematikan |
| Bentrok dengan pekerjaan multi-topik di file Travo | Mulai setelah itu masuk `main`; stage per hunk bila terpaksa |
| Nama tempat salah/kedaluwarsa | Tempat hanya dari kandidat; jam buka dicek; "Ganti tempat ini" |

## 8b. Google Spreadsheet dan Drive (satu file dengan anggaran dan pengeluaran)

### Temuan: fondasinya sudah ada
Tiap trip sudah punya **satu spreadsheet** di Drive user (folder `Djiwa Travel/<nama trip>`), dengan tab
`Pengeluaran`, `Rincian`, `Anggaran`. Sinkron **dua arah**: database tetap sumber kebenaran, edit user di sheet
ditarik masuk (baris dicocokkan lewat ID, konflik = versi app menang, penghapusan massal ditahan), lalu kolom
terkelola ditulis ulang. Hanya scope `drive.file` (tidak pernah seluruh Drive), token terenkripsi, antrean tahan
gagal, format otomatis (`formatSheet`), rename mengikuti nama trip. Jadi **tidak membuat spreadsheet kedua**:
rencana lengkap menjadi **tab tambahan di file yang sama**, sehingga anggaran, perkiraan, dan pengeluaran nyata
selalu satu angka.

### Susunan tab (satu file per trip)

| Tab | Isi | Arah sinkron |
|---|---|---|
| **Ringkasan** (baru, tab pertama) | Dasbor: nama trip, tanggal, hitung mundur, total anggaran, terpakai, sisa, bar kemajuan, 5 kategori terbesar (grafik), perlu perhatian, tautan ke tiket tercatat | App → sheet (hanya baca) |
| **Itinerary** (baru) | Baris per aktivitas: ID, tanggal, jam mulai/selesai, judul, tempat, tipe, catatan, perkiraan biaya (dua arah); hari, alamat, jam buka, tautan Maps, status pin (hanya baca) | Dua arah (lihat catatan di bawah) |
| **Anggaran** (ada) | Kolom baru **"Perkiraan Travo"** di samping Anggaran, Terpakai, Sisa, % | Dua arah (yang ada) |
| **Pengeluaran** (ada) | Tidak berubah | Dua arah (yang ada) |
| **Rincian** (ada) | Tidak berubah | Dua arah (yang ada) |
| **Persiapan** (baru) | Checklist dengan tenggat dan status selesai | Dua arah untuk centang saja (lihat catatan) |
| **Tiket & Transport** (baru) | Harga tiket termurah tercatat, tanggal data, tautan cari ulang, paket eSIM yang disarankan | App → sheet (hanya baca) |

Hubungan ke pengeluaran: `Ringkasan` dan kolom "Perkiraan Travo vs Terpakai" memakai **rumus** yang membaca
tab `Anggaran`/`Pengeluaran`, jadi saat user mencatat biaya (di app atau di sheet), dasbor ikut berubah. Satu
angka, tidak ada salinan.

### Desain yang rapi
- Palet Djiwa (merah merek untuk judul dan header, abu lembut untuk baris selang-seling), font sistem, header
  tebal dengan baris beku, lebar kolom diatur, angka rata kanan dengan format Rp/mata uang, tanggal `dd mmm`.
- Dasbor: kartu angka (sel digabung), bar kemajuan dengan format bersyarat (hijau/kuning/merah menurut persen
  terpakai), grafik batang per kategori, dan garis "perkiraan vs nyata".
- Validasi data: daftar pilihan untuk kategori dan mata uang, centang untuk checklist.
- Perlindungan lembut: kolom terkelola diberi warna header berbeda dan catatan "diisi otomatis, kolom J ke kanan
  milikmu". Kolom di luar jangkauan terkelola tidak pernah ditimpa (aturan yang sudah ada).
- Pembuatan lewat satu `batchUpdate` (tab, format, grafik, aturan bersyarat) dan ditandai `LAYOUT_VERSION = 3`;
  file lama dimigrasi saat sinkron berikutnya tanpa menghapus data user.

### Catatan arah sinkron (Itinerary dua arah, dengan pagar)
Keputusan: itinerary bisa diedit dari sheet. Karena agenda terhubung ke pin peta, Google Calendar, dan jam
buka, aturannya:

- **Boleh diedit dari sheet:** tanggal, jam mulai/selesai, judul, nama tempat, catatan, perkiraan biaya, dan
  menghapus baris. Baris baru ditambahkan di bawah (ID kosong, dibuat app).
- **Hanya baca (dikelola app):** hari ke-, tipe, alamat, jam buka, tautan Maps, status pin, ID.
- Setiap baris yang ditarik masuk melewati **validasi yang sama dengan app** (`addItineraryItem` /
  `updateItineraryItem` / `deleteItineraryItem`): tanggal harus di dalam trip, jam valid, panjang teks, uang
  bulat. Baris tidak valid dilewati dan dilaporkan di `last_report`, bukan ditulis diam-diam.
- Ubah **nama tempat** di sheet = tempat berubah, jadi koordinat lama dibuang dan pin dipasang ulang lewat
  verifikasi tempat yang sudah ada (`pinMissingPlaces`); sampai berhasil, baris ditandai "tanpa pin".
- Perubahan ikut menjalankan **sinkron Google Calendar** yang sudah ada, dan setiap perubahan dari sheet ditandai
  sumbernya (`source=sheet`) di catatan audit agar bisa diurungkan dari app.
- **Konflik:** versi app menang bila baris diubah di dua sisi (aturan yang sama); penghapusan massal ditahan
  (batas yang sudah ada); header yang rusak menghentikan penarikan.
- Usulan Travo tetap lewat **Terapkan**; edit dari sheet adalah edit user sendiri, bukan AI.
- **Persiapan:** hanya kolom "Selesai" yang ditarik balik; judul dan tenggat dikelola app.

### Alur untuk user
1. Di kartu rencana: tombol **"Buka di Google Sheets"** (jika sudah terhubung) atau **"Hubungkan Google"**
   (memakai `google-consent-sheet` yang sudah ada, scope `drive.file` saja).
2. Setelah **Terapkan**, antrean sinkron berjalan otomatis (`markSheetDirty`): agenda ke tab Itinerary,
   anggaran ke tab Anggaran, checklist ke Persiapan, tiket ke Tiket & Transport.
3. Status sinkron tampil di kartu (terakhir sinkron, laporan baris yang dilewati) dan bisa dihentikan/diputus
   (fitur yang sudah ada).
4. **Tamu:** tidak memakai Google (tidak ada akun yang terhubung); kartu menampilkan "Masuk untuk membuat
   spreadsheet". Rencana tamu tetap bisa dibagikan lewat tautan/Instagram Story.

### Google Drive
- **Folder trip** `Djiwa Travel/<nama trip>` (sudah ada) menampung spreadsheet, foto struk (sudah ada), dan
  sekarang juga **dokumen "Rencana perjalanan"**.
- **Dokumen rencana otomatis**: setiap kali user menekan **Terapkan** pada rencana lengkap dan Google sudah
  terhubung, antrean membuat/memperbarui **Google Doc "Rencana perjalanan"** di folder trip (HTML dikonversi
  lewat Drive API, tetap scope `drive.file`): hari demi hari, anggaran, strategi, persiapan. **Satu dokumen
  per trip**: dibuat sekali lalu diperbarui (bukan dokumen baru tiap kali), supaya Drive tidak penuh.
  Spreadsheet tetap sumber yang hidup; dokumen adalah salinan bacaan yang diperbarui saat rencana berubah.
  Pengaturan **"Buat dokumen otomatis"** bisa dimatikan user per trip dan di Admin; tombol "Simpan ke Drive"
  tetap ada untuk membuat ulang manual.
- **Tidak** ada akses ke berkas lain user, tidak ada baca isi Drive, dan pemutusan koneksi (`revoke`) tetap
  menghentikan semuanya dan membiarkan data user di Drive-nya sendiri.
- Berbagi: tautan sheet dibagikan user lewat Google (kita tidak mengubah izin berkas); tautan berbagi
  itinerary di app tetap jalan terpisah.

### Admin
- Admin › Google (`admin-google-panel.tsx`, sudah ada): saklar baru **"Tab rencana di Sheets"** dan
  **"Dokumen rencana ke Drive"**, plus hitungan sinkron/gagal per tab. Versi dan log audit mengikuti pola lama.

### Migrasi dan kode
- Migrasi `063_sheet_plan_tabs.sql`: aditif (kolom penanda layout/tab di `travel_google_sheet_exports`,
  `travel_google_drive_docs` untuk dokumen rencana). Tidak mengubah data yang ada.
- Model murni baru di `google-sheets-model.ts` (susunan tab Ringkasan/Itinerary/Persiapan/Tiket, pembangun
  nilai dan rumus) beserta tes; pengirim di `google-sheets.server.ts`; format di `formatSheet`.
- Pembuat dokumen: `google-drive.server.ts` (`uploadPlanDoc`) dengan antrean dan percobaan ulang seperti foto struk.

### Risiko khusus
| Risiko | Mitigasi |
|---|---|
| Kuota Google Sheets API (per menit per user) | Sinkron berkelompok lewat antrean yang ada, satu `batchUpdate` per putaran, jeda antar sinkron |
| User mengedit kolom terkelola | Header diberi petunjuk, kolom user di luar jangkauan, versi app menang bila bentrok |
| User menghapus tab/file/folder | Sudah ditangani: tab dibuat ulang, folder dibuat ulang, status `revoked`/`failed` dapat dicoba ulang |
| Injeksi rumus lewat nama tempat | `plainCell` yang ada (awalan `'` untuk `= + - @`) dipakai pada semua sel baru |
| Edit itinerary dari sheet merusak data (jam/tanggal ngawur, hapus massal) | Validasi sama dengan app, baris invalid dilewati + dilaporkan, hapus massal ditahan, jejak `source=sheet`, bisa diurungkan |
| Layout lama bentrok dengan tab baru | `LAYOUT_VERSION` naik ke 3, migrasi bertahap di sinkron berikutnya, tes migrasi pada fixture sheet lama |

## 9. Di luar cakupan (sengaja)

Akses ke berkas Drive user di luar yang dibuat Djiwa, pembayaran/booking tiket atau hotel oleh Djiwa, rating/ulasan tempat, harga hotel nyata, sumber biaya
dari situs pihak ketiga, dan perencanaan multi-negara dalam satu rencana.

## 10. Pertanyaan terbuka

Terjawab: itinerary dua arah, dokumen Drive otomatis, dan pekerjaan multi-topik `/travo` (sudah masuk `main`).

1. **Cakupan awal kota:** Jepang dan kota populer dulu (usulan), atau semua kota dengan versi sederhana?
2. **Batas "1 kali" untuk tamu:** per cookie saja (mudah dilewati dengan menghapus cookie/mode incognito),
   atau juga per IP/perangkat (lebih ketat, tapi bisa salah memblokir banyak orang di jaringan yang sama)?
