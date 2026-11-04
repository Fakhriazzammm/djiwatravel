# Plan: Google Drive + Sheets untuk user

Spec: `docs/superpowers/specs/2026-11-04-google-drive-sheets-design.md`
Prototype: `docs/superpowers/prototypes/google-drive-sheets.html`

Aturan: lokal dulu. Tidak commit, push, atau deploy tanpa diminta. Lapor status local/commit/push/deploy/health terpisah.

## Fase 0 — Spike (blokir semua fase lain)

- [ ] Dengan akun uji, minta scope `drive.file`, buat spreadsheet lewat Drive API, tulis lewat Sheets API. Catat apakah berhasil tanpa scope `spreadsheets`.
- [ ] Cek status OAuth consent screen di Google Cloud Console (Testing atau Production) dan redirect URI terdaftar.
- [ ] Putuskan: `drive.file` saja, atau tambah `spreadsheets` + verifikasi OAuth.
- Verifikasi: bukti live read-back dari akun uji, bukan hanya tes request shape.

## Fase 1 — Fondasi koneksi (token tetap di Postgres)

- [ ] Migrasi `040_google_drive_sheets.sql`: kolom `granted_scopes`, tabel `travel_google_drive_files`, `travel_google_sheet_exports`, grant ke `djiwatravel_app`.
- [ ] Refactor kecil `google-calendar.server.ts`: ekstrak `encrypt/decrypt`, `accessToken`, `refreshAccessToken`, `googleRequest` ke `src/lib/google-account.server.ts`. Calendar memakai modul itu. Perilaku Calendar tidak berubah (tes yang ada harus tetap hijau).
- [ ] `startGoogleConnect(user, features)` dengan `include_granted_scopes=true`, `state` berisi fitur yang diminta. Callback menyimpan `granted_scopes` dari respons token.
- [ ] Status API mengembalikan `{ connected, email, features: { calendar, drive, sheets }, issues }` tanpa token.
- [ ] Disconnect memanggil revoke Google lalu menghapus token. Tandai baris Drive/Sheets `revoked`.
- Tes: round-trip enkripsi, scope bertahap, token tidak pernah muncul di respons, state kedaluwarsa ditolak.

## Fase 2 — Struk ke Drive

- [ ] `google-drive.server.ts`: cari/buat folder `Djiwa Travel/<trip>`, unggah multipart, simpan `drive_file_id`. Idempotent per `receipt_scan_id`.
- [ ] Worker outbox: ambil `pending`, coba maks N kali dengan backoff, catat `last_error` yang diredaksi. Tidak boleh fire-and-forget.
- [ ] Hapus bytes di `travel_receipt_photos` hanya setelah `uploaded` terverifikasi.
- [ ] Endpoint tampil foto: server mengambil dari Drive atas nama pemilik; tolak jika bukan pemilik trip.
- [ ] UI Biaya: chip status per struk, kartu ajakan jika Drive belum aktif, tombol coba lagi.
- Tes: gagal upload tidak menghapus foto, retry idempotent, akses ditolak untuk non-pemilik, token dicabut → status `revoked` dan UI tidak crash.

## Fase 3 — Budget ke Sheets

- [ ] `google-sheets.server.ts`: buat spreadsheet dengan tab dan header tetap, protected range untuk header dan kolom ID.
- [ ] Antrean sinkron di setiap create/update/delete pengeluaran (`travel_google_sheet_exports.pending`), upsert per ID pengeluaran, batch `values.batchUpdate` untuk hemat kuota.
- [ ] UI Biaya: toggle ekspor, chip "Tersinkron …", tombol Buka di Sheets.
- Tes: mata uang asing + kurs, penghapusan, user menghapus kolom/tab → status `failed` dengan pesan jelas, retry tidak menggandakan baris.

## Fase 4 — UI koneksi (Profil)

- [ ] Ganti `calendar-sheet.tsx` menjadi sheet "Google" dengan tiga baris fitur (Kalender, Drive, Sheets) sesuai prototype. Tile di Profil berganti nama dari "Kalender" menjadi "Google".
- [ ] Ikuti skala `djiwa-mobile-ui`. Tambahkan file ke `src/test/mobile-compact-scale.test.ts`.
- [ ] Tes komponen: tiap status (belum terhubung, sebagian, penuh, error, loading).

## Fase 5 — Admin

- [ ] Panel di detail customer: status koneksi, scope, jumlah `pending/failed`, retry, putuskan, audit log.
- [ ] Kartu statistik penghematan storage (jumlah dan ukuran foto yang dipindah).
- Tes: Admin tidak pernah melihat token; aksi tercatat di audit log.

## Fase 6 — Verifikasi dan rilis

- [ ] `scripts/djiwa gate`.
- [ ] Uji live end-to-end di staging/production dengan akun uji: connect → aktifkan Drive → scan struk → file muncul di Drive → ekspor Sheets → baris muncul → putuskan.
- [ ] Perbarui `PROJECT.md` (integrasi, rute, migrasi), `LESSONS.md` bila ada temuan, dan kebijakan privasi.
- [ ] Laporkan terpisah: local, commit, push, deploy, health. Travel auto-deploy dari `main`, jadi push ke `main` = deploy.

## Urutan dan ukuran

Fase 0 (kecil) → 1 (sedang) → 2 (besar, paling bernilai) → 4 → 3 → 5 → 6. Drive diprioritaskan karena itu yang menghemat storage Postgres. Sheets bisa dirilis terpisah.
