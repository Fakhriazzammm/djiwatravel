# Profile grid icons

Surface: `/profile` "Data saya" grid (`src/components/profile/profile-service-grid.tsx`) and the
Google Calendar sheet. The My eSIM tile reuses `public/assets/explore/services/esim.svg`.

## v2 (2026-11-01)

- Files: `profile-{trips,wallet,orders,bell,support,guides,calendar}-v2.jpg` (320 x 320 JPEG,
  quality 82, resized with `sips` from 1536 x 1536 originals).
- Source: generated with Helipod AI Gateway, model `seedream-image-v5.0-pro`, 1536 x 1536, project
  `djiwatravel`, on 2026-11-01. Base prompt: "Glossy soft 3D toy-style app icon, like Apple 3D emoji:
  <object>. Single object centered with generous margin, chunky rounded shapes, soft studio key
  light, gentle gloss highlights, soft contact shadow, three-quarter view, pure flat white
  background (#FFFFFF), no text, no letters, no logos." Objects: itinerary + paper plane + pins,
  teal wallet + gold coin, orange order box + checklist, yellow bell + red dot, lavender headset +
  chat bubble, teal guidebook + bookmark + compass, tear-off calendar + green check. The wallet was
  regenerated once because the first render had a rounded-square plate behind it.
- Background: opaque white (the model cannot output transparency). The grid draws them with
  `mix-blend-mode: multiply` on the white card so the white disappears.
- Review: 2026-11-01, visual check of each render. Decorative (`alt=""`): the adjacent label
  carries the meaning. Fallback: the tile keeps its label and the image slot has a fixed size.
- Superseded: the `*-v1.svg` hand-drawn placeholders were removed.
