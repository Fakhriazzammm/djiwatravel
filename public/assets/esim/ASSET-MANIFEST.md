# eSIM Home illustrations

The earlier `travel-pass-v1.png` and `esim-chip-color-v1.png` were retired on 2026-11-01 when the
light pass set below replaced them (no surface references them any more).

## Light pass set (v1)

- Files: `esim-pass-{jp,kr,th,sg,sa,asia,global}-v1.webp` and
  `esim-state-{ready,processing,low}-v1.webp` (192 × 192, transparent WebP, 6–11 KB each).
- Surfaces: decorative art on the Home eSIM pass (`src/lib/destination-art.ts`: destination art by
  country code; state art for ready / in-progress / low quota) and the empty-state card
  (`esim-pass-global-v1.webp`). Adjacent text and actions carry the meaning; `alt=""`; flag emoji
  and a light tint are the fallback.
- Source: generated with OpenAI built-in image generation through Codex CLI (`codex exec`, imagegen
  skill) on 2026-11-01 in one session so the set shares one card design; no external image inputs.
  Trimmed and resized to 192 × 192 with sharp (WebP, quality ≤ 82).
- Review: 2026-11-01 (visual check of the generated PNGs; light palette, transparent background,
  no text/logos).
- Base prompt: "Use case: stylized-concept. One compact 3D eSIM card object, matte warm-ivory body,
  soft silver bevelled edge, champagne SIM contacts, small signal bars, gentle soft studio key light,
  close soft contact shadow, light and airy palette (no dark or black materials), three-quarter view,
  centered, genuine transparent background, generous padding, clean silhouette readable at 96 px,
  square 1:1. No text, letters, numbers, logos, flags, watermark or UI." Per file only the pastel
  accent and a tiny landmark/badge changed:

| File | Variation |
| --- | --- |
| `esim-pass-jp` | coral/blush accent, tiny torii gate |
| `esim-pass-kr` | sky-blue accent, tiny hanok roof |
| `esim-pass-th` | lavender accent, tiny temple spire |
| `esim-pass-sg` | peach accent, tiny three-tower skyline |
| `esim-pass-sa` | mint-green accent, tiny crescent and dune |
| `esim-pass-asia` | amber accent, tiny globe showing Asia |
| `esim-pass-global` | blue accent, tiny globe with orbit ring |
| `esim-state-ready` | small soft-blue checkmark badge |
| `esim-state-processing` | small soft-amber hourglass/progress ring badge |
| `esim-state-low` | small soft-orange signal-bars badge |

## Status set (v1, 2026-11-02)

- Files: `esim-state-{waiting,failed,expired,refunded}-v1.webp` (168 px + 12 px padding, transparent
  WebP, 3–5 KB). Surface: the shared light status card (`src/components/esim-status-card.tsx`) on the
  order page and eSIM detail, via `orderStatusArt()` in `src/lib/destination-art.ts`
  (READY/INSTALLED reuse `esim-state-ready`, PAID/PROVISIONING reuse `esim-state-processing`,
  CANCELLED reuses `esim-state-expired`). Decorative, `alt=""`; the chip and hint carry the meaning.
- Source: Helipod AI Gateway, model `seedream-image-v5.0-flash`, project djiwatravel, 2026-11-02, the
  same base prompt as above with a different corner badge (amber card, coral exclamation, grey clock,
  lavender return arrow) on a plain white background. White background removed by edge flood-fill,
  trimmed, resized and encoded with sharp. The expired render was cropped to the card only (badge cut).
  A green "signal" render for INSTALLED was rejected (badge read as a sad face).

