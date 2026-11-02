# PWA: install, offline, push, store packaging

## Surface matrix

| Capability | Customer | Admin (`/admin/settings` → "Aplikasi (PWA)") | Source of truth |
| --- | --- | --- | --- |
| Install | `InstallAppCard` on Home, My eSIM, Profile row; iOS gets a Safari "Add to Home Screen" sheet | Toggle, title/body copy, snooze days; funnel counts (`pwa_events`) | `admin_settings.pwa` |
| Offline | `/offline.html` shows installed-eSIM codes already stored on the device (`djiwa.orders`) | Offline-cache kill switch (clients purge caches) | `admin_settings.pwa.offlineCacheEnabled` |
| Update | "Versi baru tersedia → Perbarui" toast; worker waits for `SKIP_WAITING` | `sw_update_applied` count | `public/sw.js` `VERSION` |
| Push | Opt-in on device; `eSIM siap` push on READY transition; Badging API for unread count | Active devices, sent/failed, targeted audited send to one customer | `customer_push_subscriptions`, `notification_delivery_attempts` |

## Service-worker safety contract

- Navigations: network-first; `/offline.html` only when the network fails.
- Only content-hashed `/assets/<name>-<hash>.(js|css|woff2)` are cached. `/api`, auth, checkout, wallet
  and webhooks never go through the worker. Public non-hashed assets (`/assets/home-hero/*`) are not cached.
- Bump `VERSION` in `public/sw.js` only when changing worker logic; browsers re-fetch `sw.js` on each visit.
- Kill switch: Admin sets `offlineCacheEnabled=false`; each client posts it to the worker, which deletes caches and
  stops intercepting. Sign-out already clears `djiwa.orders` (`clearTravelLocalData`), which is what the offline page reads.

## Push setup (server)

1. `npx web-push generate-vapid-keys`; set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in the VPS env.
2. Apply migration `032_pwa_events.sql`.
3. Until all three are set, push stays off (`pushPublicKey` is null) and the Admin panel shows "VAPID belum diset".
4. iOS delivers push only to an installed (Home Screen) PWA, iOS 16.4+.

## Store packaging (optional, not shipped in the repo)

- **Android (Play Store)**: Trusted Web Activity via Bubblewrap/PWABuilder pointing at
  `https://djiwatravel.com/manifest.webmanifest`. Needs a Play signing key; publish
  `/.well-known/assetlinks.json` with that key's SHA-256 fingerprint (do not commit a placeholder: a wrong
  fingerprint breaks full-screen mode).
- **iOS (App Store)**: a Capacitor shell loading the site. Apple guideline 4.2 can reject thin web wrappers; add
  native value (push, widgets) first. Requires an Apple Developer account.
