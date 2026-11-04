# Google Drive + Sheets untuk user — design

Status: diimplementasi lokal (belum di-commit/deploy). Tanggal: 2026-11-04.

Penyimpangan dari draft awal, supaya spec tetap jujur:
- Sheet "Google" di Profil: hanya Drive yang punya toggle. Kalender menampilkan status "Aktif" (putus lewat "Putuskan Google") dan Sheets menampilkan "Siap"; ekspornya diaktifkan per trip di halaman Biaya.
- Scope tambahan `userinfo.email` (non-sensitif) diminta agar email akun bisa ditampilkan.
- Kolom `drive_enabled` ditambahkan agar user bisa menjeda Drive tanpa memutus Google.
- Status antrean ditambah `uploading`/`syncing` untuk mencegah dua worker mengerjakan item yang sama.
- Sinkron Sheets menulis ulang seluruh tab "Pengeluaran" dari database (idempotent), bukan memperbarui baris per ID.
- Panel Admin ada di Admin → Settings (statistik, daftar masalah, coba ulang semua, putuskan satu user, audit log). Belum ada saklar global untuk mematikan Drive/Sheets.

## Tujuan

Traveler bisa menghubungkan akun Google mereka sehingga:

1. **Foto struk** (Biaya → scan struk) disimpan di **Drive milik user**, bukan di Postgres kita.
2. **Budget/Biaya trip** diekspor ke **Spreadsheet milik user** yang bisa mereka edit dan bagikan.

Database kita tetap sumber kebenaran. Sheets adalah salinan ekspor, bukan backend. Alasan ada di percakapan sebelumnya: kuota API, tanpa skema, akses bisa dicabut, dan data inti tidak boleh bergantung pada file yang bisa diedit user.

## Di mana token Google disimpan

**Postgres kita sendiri, terenkripsi, hanya dibaca server.** Tidak ada token di browser, di localStorage, atau di response API.

| Hal | Lokasi |
|---|---|
| Access + refresh token | Tabel `customer_google_calendar_connections` (migrasi 019), kolom `access_token_encrypted` dan `refresh_token_encrypted` |
| Enkripsi | AES-256-GCM di `src/lib/google-calendar.server.ts` (`encrypt`/`decrypt`), kunci dari env `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` |
| Kunci enkripsi dan client secret | Env VPS Travel saja, tidak pernah di repo |
| Baris per user | Primary key `customer_auth_subject` (satu koneksi Google per user) |
| Yang dikirim ke browser | Hanya `google_account_email`, daftar scope yang diberikan, dan status koneksi |

**Keputusan: satu koneksi Google, scope bertahap.** Token yang sama dipakai Calendar, Drive, dan Sheets. Saat user mengaktifkan Drive, kita minta scope tambahan dengan `include_granted_scopes=true`. Google mengembalikan refresh token baru yang mencakup semua scope, lalu kita menimpa kolom terenkripsi yang lama.

Perubahan skema (additive, aman dijalankan ulang):

- Tambah kolom `granted_scopes text[] not null default '{}'` pada `customer_google_calendar_connections`.
- Isi awal: baris yang sudah terhubung diisi scope Calendar.
- Nama tabel tidak diganti. Ganti nama berisiko dan tidak memberi manfaat. Env `GOOGLE_CALENDAR_*` tetap dipakai, alias bisa menyusul.

Risiko yang harus diterima: kunci enkripsi bocor + dump database = akses ke Drive/Sheets user. Mitigasi: scope `drive.file` (hanya file yang dibuat app), kunci terpisah dari database, dan tombol Putuskan yang mencabut token di Google (`oauth2.googleapis.com/revoke`) lalu menghapus baris.

## Scope yang diminta

| Fitur | Scope | Catatan |
|---|---|---|
| Calendar (sudah ada) | scope Calendar yang ada | tidak berubah |
| Simpan struk ke Drive | `https://www.googleapis.com/auth/drive.file` | non-sensitif, hanya file buatan app |
| Ekspor budget ke Sheets | `https://www.googleapis.com/auth/drive.file` | cukup, karena spreadsheet dibuat oleh app lewat Drive API |

Dengan `drive.file`, kita tidak perlu scope `spreadsheets` yang sensitif. Spreadsheet dibuat app (mimeType `application/vnd.google-apps.spreadsheet`), jadi tetap termasuk "file yang dibuat app", lalu diisi lewat Sheets API. Hal ini perlu dibuktikan di langkah 1 plan (spike) sebelum keputusan final. Kalau Sheets API menolak dengan `drive.file`, fallback-nya scope `spreadsheets` dan verifikasi OAuth.

Scope `drive` penuh dan `drive.readonly` tidak dipakai (restricted, butuh review keamanan pihak ketiga).

## Data baru

```sql
-- migrasi 040 (draft)
alter table customer_google_calendar_connections
  add column if not exists granted_scopes text[] not null default '{}';

create table if not exists travel_google_drive_files (
  receipt_scan_id uuid primary key references travel_receipt_scans(id) on delete cascade,
  trip_id uuid not null references travel_trips(id) on delete cascade,
  customer_auth_subject text not null,
  drive_file_id text,
  drive_folder_id text,
  status text not null check (status in ('pending','uploaded','failed','revoked')),
  attempts integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);

create table if not exists travel_google_sheet_exports (
  trip_id uuid primary key references travel_trips(id) on delete cascade,
  customer_auth_subject text not null,
  spreadsheet_id text,
  status text not null check (status in ('pending','synced','failed','revoked')),
  last_synced_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now()
);
```

Status `pending` adalah antrean (outbox) sesuai pelajaran di `LESSONS.md`: tidak ada fire-and-forget tanpa status yang bisa dicoba ulang.

## Perilaku

### Struk → Drive
1. User scan struk dan menyimpan pengeluaran seperti sekarang. Foto tetap masuk `travel_receipt_photos` dulu.
2. Jika Drive terhubung: buat baris `pending`, worker mengunggah ke folder `Djiwa Travel / <nama trip>` di Drive user, lalu simpan `drive_file_id`.
3. Setelah `uploaded`, bytes di `travel_receipt_photos` dihapus. Halaman Biaya menampilkan foto lewat endpoint server yang mengambil dari Drive dengan token user (tidak ada URL Drive publik).
4. Jika upload gagal: foto tetap di Postgres, status `failed`, ada tombol coba lagi. User tidak kehilangan struk.
5. Jika user mencabut akses atau menghapus file: status `revoked`/`failed`, foto hilang dari tampilan, pengeluaran tetap ada. Ini harus diberi tahu jelas di UI.

### Budget → Sheets
1. User mengaktifkan "Ekspor ke Google Sheets" per trip.
2. App membuat spreadsheet "Budget — <nama trip>" dengan tab `Pengeluaran` (header tetap: tanggal, toko, kategori, item, jumlah, mata uang, kurs, jumlah IDR, link struk) dan tab `Ringkasan` (rumus total per kategori).
3. Setiap pengeluaran dibuat, diubah, atau dihapus mengantre sinkron satu arah (app → Sheets). Baris dicocokkan lewat kolom ID tersembunyi, bukan nomor baris.
4. Edit user di Sheets **tidak** ditarik balik. Banner di sheet menjelaskan hal ini. Perubahan dua arah ditunda sampai ada kebutuhan nyata.
5. Sinkron bersifat idempotent: ID pengeluaran sebagai kunci, jadi retry tidak menggandakan baris.

## User flow

```
Profil → tile "Google" → sheet koneksi
  ├─ belum terhubung → [Hubungkan Google] → layar izin Google (Calendar saja, seperti sekarang)
  └─ terhubung
       ├─ Kalender   ✓ aktif
       ├─ Drive      [Aktifkan]  → layar izin Google (tambah drive.file) → kembali ke sheet, toggle aktif
       └─ Sheets     [Aktifkan]  → sama dengan Drive (scope yang sama)

Biaya (trip) → ikon Google di header
  ├─ Drive belum aktif → kartu ajakan "Simpan struk di Drive kamu" → [Aktifkan] → alur izin → kembali ke Biaya
  ├─ Scan struk → simpan → chip "Menyimpan ke Drive…" → "Tersimpan di Drive"
  └─ Ekspor ke Sheets → [Buat spreadsheet] → chip "Tersinkron 2 menit lalu" · [Buka di Sheets]

Gagal/dicabut → baris merah di sheet koneksi: "Perlu dihubungkan ulang" + [Coba lagi]
Putuskan → konfirmasi tidak perlu (reversibel: bisa hubungkan lagi) → toast "Google diputus · Undo" tidak berlaku
          untuk revoke, jadi tampilkan penjelasan: file di Drive/Sheets user tidak dihapus.
```

Prototype layar ada di `docs/superpowers/prototypes/google-drive-sheets.html`.

## Admin (wajib per AGENTS.md)

Halaman Admin → Customers → detail user menampilkan:
- Status koneksi Google dan scope yang diberikan (tanpa token).
- Jumlah file Drive `pending/failed` dan ekspor Sheets `failed`, dengan `last_error` yang sudah diredaksi.
- Tombol **Coba ulang** per item dan **Putuskan koneksi** (revoke) bila user meminta.
- Statistik: pemakaian Drive/Sheets, jumlah bytes `travel_receipt_photos` yang berhasil dipindah (bukti penghematan).
- Audit log untuk aksi Admin.

## Di luar cakupan

- Sinkron dua arah dari Sheets ke app.
- Mengimpor file Drive yang sudah ada.
- Scope `drive` penuh, `drive.readonly`, atau `spreadsheets` kecuali spike memaksa.
- Menghapus file di Drive/Sheets user saat mereka memutus koneksi.

## Risiko dan pertanyaan terbuka

1. **Spike scope**: apakah Sheets API menerima `drive.file` untuk spreadsheet buatan app? Jawaban menentukan perlu verifikasi OAuth atau tidak.
2. **Status OAuth consent screen**: masih Testing (maks 100 user uji, refresh token kedaluwarsa 7 hari) atau sudah In production? Ini memengaruhi kehandalan. Perlu dicek di Google Cloud Console oleh pemilik.
3. **`redirect_uri_mismatch`**: pernah tercatat di `LESSONS.md`. Callback baru harus memakai redirect URI yang sama atau didaftarkan di Console.
4. **Foto yang sudah ada di Postgres**: apakah perlu migrasi massal ke Drive? Usul: tidak, hanya struk baru.
5. **Kebijakan privasi**: perlu menyebut penyimpanan di Drive/Sheets user dan penggunaan data Google sesuai Limited Use.
