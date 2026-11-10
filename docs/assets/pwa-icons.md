# PWA icon refresh — 2026-11-10

Official reference: `src/assets/logo.png` (641×449). Generated with the built-in
OpenAI ImageGen tool; returned artwork was 1254×1254. The retained high-resolution
master is `public/icon-1024.png` (downsampled, not enlarged from the old icon).
The original source logo remains unchanged.

Prompt: Faithfully sharpen the official navy/red Djiwa Travel wordmark, airplane
and swooshes. Center the complete logo on a full-bleed warm white #faf9f6 square.
Preserve letter shapes, proportions and brand identity. Crisp smooth contours;
restrained iOS application icon clarity. No baked rounded corners, border, drop
shadow, perspective, extra symbols or device mockup. Request 2048×2048; actual
returned resolution 1254×1254.

Derivatives use macOS `sips -z SIZE SIZE` directly from the generated source:
1024/512/192 PNG, Apple Touch 180, favicon 64/32/16, and an ICO containing
16/32/64 lossless PNG entries. Maskable: resize source to 448, then pad to 512
with #faf9f6, keeping the complete wordmark inside the central safe circle.
OS/browser applies its own corner mask. Icon and manifest links carry
`?v=logo-20261110` to request fresh artwork; legacy filenames also contain the
new artwork for notifications, install cards and social-image references.

## Surface matrix

| Surface | Entry/result or control | Source / permission | Empty/loading/error | Verification |
| --- | --- | --- | --- | --- |
| Customer | Shared document head, Add to Home Screen, PWA manifest, shortcuts | Public static assets + root head; no session required | Native icon fetch; ICO/PNG alternatives; existing install policy retained | PNG dimensions, manifest references, focused PWA tests, build |
| Admin | Same root head; `/admin/settings#pwa` retains install/cache/push control | `admin-pwa-panel.tsx`, `pwa-config.ts`, existing protected `pwa.fn.ts` actions | Existing saving/error/conflict states retained | PWA tests cover Admin-disabled install and settings validation |

No new Admin logo editor is applicable: branding is a versioned release asset,
not a tenant setting. No customer data, ownership, server actions, provider,
database or migrations are involved. `public/sw.js` only caches hashed build
assets and does not cache these icon URLs; no worker lifecycle change is needed.

Validation: `npm test -- src/test/pwa.test.ts` (14 passing), focused ESLint,
`git diff --check`, PNG/ICO dimensions and manifest resolution, and production
build. Local changes only: no commit, push, deployment or production checks.
Existing installations may retain an OS-managed icon until the platform refreshes
its installation metadata; query versions do not force an OS icon replacement.

Build result: `npm run build` exited 0; `.output/public/icon-1024.png` matches
the source SHA-256 `4446e0f5edb3e043178a1a96f6ca6e86d6162104c6160b8348085fac94f18c4a`.
Non-blocking build warnings include existing `.worktrees/djiwapay-wallet`
tsconfig parsing and large bundle chunks. No full test suite or installed-device
verification was run. Focused ESLint and `git diff --check` passed. Existing
Travo/assistant edits and prototype files were preserved.
