# Alur kerja pengembangan Djiwa Travel (2 VPS)

Dokumen ini menjelaskan cara mengubah, merilis, dan memeriksa Djiwa Travel dengan
benar, termasuk bagian yang hidup di VPS Tentram (auth, wallet Pay, Mayar).
Aturan repo tetap di [`AGENTS.md`](../AGENTS.md); arsitektur di
[`PROJECT.md`](../PROJECT.md); insiden di [`LESSONS.md`](../LESSONS.md). Dokumen ini
adalah _cara kerjanya_, dan CLI `scripts/djiwa` adalah alatnya.

## Pertanyaan pertama: apakah ada auto-deploy?

**Ya, untuk Travel.** `djiwa-autodeploy.timer` di VPS Travel berjalan tiap 3 menit:
`git fetch` → bila `origin/main` berubah → migrasi SQL → build di folder sementara →
hentikan service → tukar `.output` → nyalakan → cek semua route statis dan semua
JS/CSS beranda → rollback otomatis bila gagal. Jadi **push ke `main` = deploy** dalam
sekitar 3–5 menit. Jangan push perubahan setengah jadi ke `main`.

**Tidak, untuk Tentram/Pay.** Perubahan di VPS Tentram dipasang manual (lihat
[Runbook Tentram](#runbook-tentram-manual)). Checkout di VPS itu berada di branch
snapshot dan **menyimpang dari repo**; `djiwa drift` menunjukkan file mana.

## Peta: apa yang hidup di mana

```
              browser
                 │
        djiwatravel.com ──────────► VPS TRAVEL  /home/ubuntu/djiwatravel
        (TanStack Start/Nitro :3000)   Postgres lokal "djiwatravel" (pesanan, eSIM, afiliasi, admin)
                 │  login (session Better Auth)      timers: autodeploy, esim-sync (1 menit), affiliate-sweep
                 ▼
   api.djiwatentram.web.id ───► VPS TENTRAM  /opt/djiwatentramapp   (otoritas auth + uang)
   Better Auth :3001               Postgres supabase-db schema "pos": customers, wallet, ledger, orders
   edge functions (Supabase)       customer-wallet, mayar-webhook, mayar-payment-processor, travel-finance-*
   Pay web djiwapay.web.id         timer: djiwa-mayar-processor (1 menit)
```

Aliran lintas VPS yang harus dipahami sebelum mengubah apa pun:

| Alur | Jalur | Catatan |
| --- | --- | --- |
| Login / identitas | Travel → `api.djiwatentram.web.id` | Owner pesanan diturunkan di server dari session; tidak pernah dari browser. |
| Bayar dengan saldo | Travel → Tentram `travel-wallet-payment` | Tentram menulis ledger (`source_app=djiwa-travel`). Travel tidak menyalin ledger. |
| Bayar QRIS/VA | Travel → invoice Mayar. Mayar → **Tentram** `mayar-webhook` → sinyal bertanda tangan → Travel `/api/webhooks/mayar-forward` | Satu akun Mayar hanya punya satu URL webhook, jadi Tentram yang menerima. Sinyal hanya berisi id; Travel memverifikasi ke Mayar sebelum settle. Sweep 1 menit adalah cadangan. |
| Pencatatan keuangan | Travel → `travel-finance-settlement` (Tentram) | `DJIWA_TRAVEL_FINANCE_SETTLEMENT_URL` + `DJIWA_TRAVEL_SETTLEMENT_SECRET`. |
| Riwayat Pay memuat pembelian Travel | Pay `auth-server` → Travel `/api/internal/member-purchases` (HMAC) | Travel tetap pemilik data; Pay hanya membaca saat ditampilkan. |
| Provider eSIM | eSIM Access → Travel `/api/webhooks/esim-access/<token>` | Token di path; salah token = 404. |

Rahasia bersama (`DJIWA_TRAVEL_CALLBACK_SECRET`, `DJIWA_TRAVEL_SETTLEMENT_SECRET`) harus
identik di kedua VPS. `djiwa env` membandingkannya lewat fingerprint tanpa mencetak nilai.

## CLI `scripts/djiwa`

```sh
scripts/djiwa help          # atau: npm run djiwa -- help
```

| Perintah | Fungsi |
| --- | --- |
| `status` | git lokal, kedua VPS (service, timer, deploy, kunci), cek publik + kontrak lintas VPS |
| `verify` | beranda + **semua aset JS/CSS dilayani 200**, semua route statis, kontrak lintas VPS |
| `gate [path…]` | eslint + tsc (hanya file yang diubah) + `vitest related`; `--full` = suite penuh |
| `ship -m "pesan" path…` | gate → commit **hanya path yang disebut** → rebase bila perlu → push `main` → tunggu autodeploy → verifikasi |
| `wait-deploy [sha]` | tunggu autodeploy memasang commit lalu verifikasi |
| `logs <target>` | `travel`, `autodeploy`, `sweep`, `affiliate`, `nginx`, `auth`, `edge`, `mayar`; `-n`, `--since`, `--grep` |
| `db travel\|tentram "select …"` | SQL **baca-saja** (`BEGIN READ ONLY`, satu statement, daftar kata terlarang); `--tables`, `--describe <tabel>`; `db migrations` |
| `sweep` | jalankan sekarang sweep pembayaran + sync eSIM |
| `env` | **nama** env (tak pernah nilai) vs `.env.example`; kecocokan rahasia lintas VPS |
| `drift` | file Tentram yang aktif vs repo lokal; terpasang vs `origin/main` |
| `new migration\|route\|api` | scaffold bernomor/terformat (api: `--kind task\|signed`) |
| `matrix` | templat matriks permukaan customer/admin |
| `topology`, `doctor` | peta sistem; cek alat dan SSH |

Prasyarat: Node ≥ 20, alias SSH `vps-djiwa-travel` dan `vps-djiwa-tentram` di
`~/.ssh/config` (override: `DJIWA_TRAVEL_SSH`, `DJIWA_TENTRAM_SSH`), repo Tentram di
`~/djiwatentramapp` (override: `DJIWA_TENTRAM_REPO`). `DJIWA_COMMIT_TRAILER` menambah
trailer (mis. `Co-Authored-By: …`) ke commit dari `ship`.

Pagar keselamatan yang tertanam: `ship` menolak `.`/`-A` dan hanya `git add` path yang
disebut (perubahan orang lain tidak ikut), hanya dari `main`, tanpa force-push; `db`
menolak tulis/DDL/kunci/multi-statement dan berjalan di transaksi baca-saja; `env` hanya
mencetak nama dan fingerprint 6 karakter.

## Alur harian

```sh
scripts/djiwa status                          # mulai dari kondisi nyata, bukan dugaan
# ... ubah kode ...
scripts/djiwa gate                            # cepat; --full sebelum perubahan besar
scripts/djiwa ship -m "feat(x): ..." src/a.ts src/test/a.test.ts
```

`ship` melaporkan **local / commit / push / deploy / service / publik** secara terpisah,
sesuai kontrak laporan di `AGENTS.md`.

### Langkah untuk tiap jenis perubahan

| Yang diubah | Titik masuk | Wajib ikut |
| --- | --- | --- |
| Halaman customer | `src/routes/*.tsx` (`djiwa new route /path`) | UI admin yang mengendalikannya, tes, state kosong/loading/error |
| Logika server | `src/lib/*.server.ts` + `*.fn.ts` (impor server hanya di modul server) | tes fokus; idempoten bila bisa diulang |
| Endpoint server-ke-server | `src/routes/api.*.ts` (`djiwa new api … --kind signed\|task`) | tes seperti `member-purchases-endpoint.test.ts`; rahasia di kedua VPS (`djiwa env`) |
| Webhook provider | `src/routes/api.webhooks.*.ts` | autentikasi, catat dulu, proses aman diulang |
| Database Travel | `djiwa new migration <nama>` + `drizzle/schema.ts` | migrasi aditif/idempoten; `djiwa db migrations` untuk status |
| Admin | `src/routes/admin.*.tsx` | selalu dipasangkan dengan perubahan customer (matriks permukaan) |
| Auth / wallet / Mayar | **repo Tentram** (jangan ditiru di Travel) | baca `AGENTS.md` Tentram; runbook di bawah |

Tulis matriks permukaan (`djiwa matrix`) sebelum menulis kode; fitur dianggap belum
selesai bila sisi customer atau sisi admin belum bisa dipakai penuh.

## Runbook Tentram (manual)

Semua langkah: SSH ke `vps-djiwa-tentram`, **cadangkan dulu**, ubah minimal, verifikasi.
Jalankan `djiwa drift` sebelum dan sesudah.

**Edge function** (`/opt/supabase-selfhost/volumes/functions/<fn>/`): jangan menimpa dari
repo bila `djiwa drift` melaporkan BERBEDA (versi aktif bisa memuat tambalan yang tidak
ada di repo, mis. aksi `find-order` di `customer-wallet`). Salin file aktif ke
`/opt/supabase-selfhost/backups/<nama>/`, terapkan perubahan minimal ke file aktif, lalu
`cd /opt/supabase-selfhost && sudo docker compose restart functions`. Lakukan perubahan
yang sama di repo Tentram dan commit. Uji lewat `curl` ke `127.0.0.1:8099/functions/v1/<fn>`.

**Auth server** (`/opt/djiwatentramapp/apps/auth-server/src/index.ts`, service
`better-auth`, env `/etc/djiwatentramapp/better-auth.env`): cadangkan file dan env,
validasi sintaks sebelum restart, `sudo systemctl restart better-auth` (login semua app
Tentram terputus beberapa detik), lalu cek `POST /api/pay-bridge/wallet` tanpa sesi = 401.

**Pay web** (`djiwapay.web.id`): dibangun di laptop dari **worktree bersih** (perubahan
lain yang belum di-commit bisa ikut ter-bundle lewat `@yumipos/web-shared`), `rsync` ke
`/opt/djiwapay-releases/<nama-rilis>`, lalu
`sudo ln -sfn /opt/djiwapay-releases/<nama-rilis> /opt/djiwatentramapp/apps/djiwapay/dist`.
Rollback: arahkan symlink kembali ke rilis sebelumnya (rilis lama tidak dihapus).

Pengujian Tentram memakai `bun:test`; bun mungkin tidak terpasang di laptop. Logika murni
bisa dijalankan dengan salinan sementara berformat vitest; jangan commit salinan itu.

## Rilis darurat tanpa autodeploy

`scripts/deploy-vps.sh` tetap ada untuk keadaan darurat. Ia sekarang memegang **kunci
`flock` yang sama** dengan autodeploy selama seluruh proses, jadi keduanya tidak bisa
menukar `.output` bersamaan (penyebab halaman skeleton 3 Nov 2026). Bila autodeploy
sedang berjalan, skrip menolak dan meminta mengulang. Untuk kondisi normal, gunakan
`djiwa ship`.

## Gejala → langkah pertama

| Gejala | Mulai dari |
| --- | --- |
| Halaman hanya skeleton | `djiwa verify` (aset 404 = proses lama + `.output` baru → `sudo systemctl restart djiwatravel`; lihat `LESSONS.md`) |
| Pembayaran sudah masuk tapi pesanan pending | `djiwa sweep`, `djiwa logs sweep`, `djiwa db travel "select status, paid_at from customer_orders order by created_at desc limit 5"` |
| eSIM tidak muncul | `djiwa logs travel --grep esim`, status `esim_provisioning_orders`, webhook eSIM Access |
| Saldo/riwayat Pay salah | `djiwa db tentram "select … from pos.customer_wallet_ledger …"`, `djiwa logs auth` |
| Webhook Mayar tidak sampai | `djiwa logs edge --grep mayar`, `djiwa logs mayar`, `djiwa env` |
| Deploy tidak jalan | `djiwa status` (selisih `terpasang` vs `origin/main`), `djiwa logs autodeploy` |
