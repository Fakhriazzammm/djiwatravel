# Implementing Delight

implementasi

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2b192783-a802-45e0-bf2f-60ac1fd4bb56).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Deploy ke VPS

Produksi: `https://djiwatravel.com` → nginx → `127.0.0.1:3000` (`djiwatravel.service`) di `ubuntu@43.133.156.93`.

```sh
scripts/deploy-vps.sh                 # build -> migrasi -> upload -> swap -> restart -> verifikasi
scripts/deploy-vps.sh --skip-build    # kirim .output yang sudah ada
scripts/deploy-vps.sh --no-migrate    # lewati fase migrasi SQL
scripts/deploy-vps.sh --skip-source   # hanya kirim .output, jangan sinkron source
scripts/deploy-vps.sh --dry-run       # lihat rencana tanpa mengubah apa pun
```

Yang otomatis:

- **Route/halaman baru** — build Vite/Nitro ikut membawa semua `src/routes/*.tsx`. Script membaca folder itu, jadi route statis baru langsung di-deploy dan diuji tanpa mengedit script; route dengan segmen dinamis (`$id`, `$slug`) dihitung tapi tidak diprobe karena butuh ID nyata.
- **Verifikasi** — setiap route statis dicek 2xx/3xx lewat `localhost:3000` **dan** URL publik, plus pencocokan hash asset HTML publik vs build lokal. Gagal satu saja → rollback otomatis ke `.output.bak-<timestamp>` (3 backup terakhir disimpan).
- **Source VPS** — `src/`, `public/`, `migrations/`, `drizzle/`, `scripts/`, dan config ikut disinkronkan supaya isi host sama dengan commit yang di-deploy.
- **Migrasi SQL** — `scripts/apply-migrations.sh` mencatat migrasi yang sudah jalan di tabel `deploy_schema_migrations` dan hanya menjalankan file baru (satu transaksi per file). Migrasi gagal = deploy berhenti sebelum swap.

Baseline sekali per host yang skemanya sudah current tapi belum punya tabel pencatat:

```sh
ssh ubuntu@43.133.156.93 'cd /home/ubuntu/djiwatravel && bash scripts/apply-migrations.sh --baseline'
```

Cek status migrasi kapan saja: `bash scripts/apply-migrations.sh --status` (di host) atau lewat SSH yang sama.

Override host/key/service lewat env `DJIWA_DEPLOY_HOST`, `DJIWA_DEPLOY_KEY`, `DJIWA_DEPLOY_SERVICE`, `DJIWA_DEPLOY_URL`.

### Auto-deploy dari `main`

VPS memantau `origin/main` tiap 3 menit lewat `djiwa-autodeploy.timer` → `djiwa-autodeploy.service`. Setiap push ke `main` (termasuk commit dari Lovable) otomatis: fetch → migrasi SQL baru → `npm install` bila lockfile berubah → build → swap `.output` → restart → verifikasi semua route → rollback bila gagal.

- Status: `systemctl list-timers djiwa-autodeploy.timer` dan `journalctl -u djiwa-autodeploy.service -n 50`
- Cek manual: `sudo systemctl start djiwa-autodeploy.service`
- Paksa build ulang: `bash scripts/autodeploy.sh --force`
- Pause sementara: `sudo systemctl stop djiwa-autodeploy.timer`
- Pasang di host baru: `sudo bash scripts/install-autodeploy.sh` (butuh checkout git di `/home/ubuntu/djiwatravel`)
- Penanda rilis: `.deployed-sha` (SHA yang sedang live) dan `.deps-lock` (hash lockfile terakhir yang di-install)

Push ke `main` berarti langsung production. Untuk perubahan berisiko, uji dulu lewat `scripts/deploy-vps.sh --dry-run` atau kerjakan di branch lain.

## Djiwa Pay top-up boundary

The authenticated profile page exposes Djiwa Pay saldo top-up only after the central Better Auth session is verified server-side. Travel does not create or store a wallet, balance, ledger, Mayar key, or webhook settlement.

Before enabling this in a runtime, configure these server-only variables:

- `DJIWA_PAY_CUSTOMER_WALLET_URL`: the verified HTTPS URL for the canonical `customer-wallet` Edge Function boundary.
- `DJIWA_TRAVEL_PUBLIC_ORIGIN` (optional): HTTPS origin used for the canonical `/saldo` return URL; defaults to `https://djiwatravel.com`.

The server resolves each user's canonical `customerSourceId` by forwarding the incoming Better Auth session cookie to `GET https://api.djiwatentram.web.id/api/customer/profile`. It requires a non-empty `customer.source_id` and case-insensitive email ownership matching the authenticated Better Auth user. Unavailable, malformed, or mismatched profiles fail closed before `customer-wallet` is called. It must never pass `user.id` as `sourceId`, use email as identity, or read a shared browser/server value as every user's source id.

`DJIWA_PAY_CUSTOMER_SOURCE_ID` is not used: canonical identity is a per-request server-side exchange result, never a static environment value or browser input.

Invoice creation is pending only; Travel never marks saldo credited. The canonical Mayar webhook remains the only settlement authority.
