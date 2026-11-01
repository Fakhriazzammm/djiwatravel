# Djiwa Pay action icons

Surface: `/wallet` (quick actions and the "Di Djiwa Pay" section).

- `topup`, `send`, `receive`, `scan-qr`, `history`, `card`, `withdraw`, `help` (`*.webp`): the
  original set, already shipped with Travel.
- `bills.png` (192 x 192, transparent PNG, ~41 KB): added 2026-11-01 for the PPOB row. It is the
  same 3D icon Djiwa Pay uses for bills, resized from `djiwa-pay-actions/bills.webp` (read-only
  copy from apps/djiwapay on the Djiwa Tentram VPS) with `sips`. Owner: the Djiwa Pay app, same
  organisation, no external license.
- Decorative (`alt=""`): adjacent labels carry the meaning.
- The action and PPOB names mirrored in `src/lib/djiwa-pay-services.ts` come from the same app
  bundle (read 2026-11-01); Djiwa Pay stays the source of truth.
