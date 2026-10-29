# Djiwa Travel

Platform perjalanan Djiwa untuk katalog eSIM, checkout, provisioning,
customer support, My Trips, wallet handoff, dan operasi admin.

## Mulai dari sini

Dokumen kanonik dipisah agar agent dan manusia hanya membaca konteks yang
dibutuhkan:

- [`AGENTS.md`](AGENTS.md) — aturan kerja, ownership, secret safety, dan
  pelaporan release.
- [`CLAUDE.md`](CLAUDE.md) — adapter singkat yang mengikuti `AGENTS.md`.
- [`PROJECT.md`](PROJECT.md) — arsitektur, route/source map, integrasi, data,
  auth, VPS, dan runbook.
- [`DESIGN.md`](DESIGN.md) — UI/UX iOS-inspired, komponen, state, motion, dan
  asset 3D.
- [`LESSONS.md`](LESSONS.md) — lessons operasional terverifikasi dan guardrail.
- [`src/routes/README.md`](src/routes/README.md) — konvensi file-based routing.

Sebelum mengubah kode: pastikan repo/branch/environment/database/VPS target,
baca `git status --short`, ikuti alur route → server module → database/provider,
dan pertahankan perubahan yang tidak terkait.

## Development command matrix

| Tujuan | Command | Bukti yang dicari |
| --- | --- | --- |
| Install | `npm install` | dependency sesuai lockfile |
| Local app | `npm run dev` | server lokal dapat diakses |
| Focused check | `npm test -- src/test/<file>.test.ts` | perilaku terkait lulus |
| Full tests | `npm test` | hasil suite dan baseline failure dicatat |
| Build | `npm run build` | `.output/server/index.mjs` tersedia |
| Lint | `npm run lint` | error lint dicatat atau nol |
| Route inventory | `bash scripts/list-routes.sh` | route bersumber dari `src/routes/` |

Gunakan `.env.example` hanya sebagai daftar nama variable. Nilai auth,
database, AI, eSIM Access, Mayar, dan Calendar harus berada di environment
server/lokal yang di-ignore; jangan gunakan prefix `VITE_` untuk secret.

## Deploy dan operasi VPS

Target Travel yang didokumentasikan oleh script adalah
`/home/ubuntu/djiwatravel`, service `djiwatravel.service`, listener
`127.0.0.1:3000`, dan public origin `https://djiwatravel.com`.

```sh
scripts/deploy-vps.sh --dry-run       # rencana tanpa perubahan
scripts/deploy-vps.sh                 # build, migrasi, swap, restart, cek
scripts/deploy-vps.sh --skip-build    # gunakan .output yang sudah ada
scripts/deploy-vps.sh --no-migrate    # hanya jika migration boundary dipahami
```

Baca [`scripts/deploy-vps.sh`](scripts/deploy-vps.sh) sebelum release. Script
membedakan build, migrasi, source sync, atomic swap, backup, systemd restart,
localhost route checks, public route/asset checks, dan rollback. Push ke branch
production atau deploy ke VPS hanya jika diminta. Auto-deploy dan timer ada di
[`scripts/autodeploy.sh`](scripts/autodeploy.sh) serta
`scripts/systemd/`.

Laporkan status secara terpisah: local source, commit, pushed revision,
deployed artifact, service/listener health, dan public reachability. HTTP 200
saja tidak membuktikan artifact, auth, data, atau migrasi yang benar.

## Cross-project boundary

Djiwa Travel bukan Djiwa Tentram/Djiwa Pay. Keduanya dapat memiliki repository,
app, database, domain, VPS, dan runbook berbeda. Travel memakai central Better
Auth/profile contract melalui `api.djiwatentram.web.id`; ownership tetap
diturunkan dari session server-side. Djiwa Pay tetap menjadi authority untuk
wallet, ledger, settlement, dan Mayar. Sebelum pekerjaan lintas app/VPS,
inspeksi `AGENTS.md` dan runbook proyek tujuan secara terpisah.
