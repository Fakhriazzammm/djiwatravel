# Explore service assets

Reviewed 2026-11-07. The service grid is shown on Home (`src/routes/index.tsx`)
and Explore (`src/routes/explore.tsx`) through
`src/components/explore/service-category-grid.tsx`.

| File                           | Source / generation                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Review                                                                                                                       | Surface                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `services/flight-plane-v1.png` | Generated with OpenAI ImageGen through Codex on 2026-11-07. Original transparent 1254px render resized to 320 × 320 RGBA PNG (84 KB); no external image input. Prompt: “Single recognizable commercial passenger airplane, polished miniature 3D travel-service icon, ivory-white fuselage with warm golden-yellow accents and blue windows, centered three-quarter view, soft studio light and small contact shadow, transparent background, no airport, text, logo, or watermark.” | 2026-11-07: confirmed airplane silhouette, transparency, no text/branding; matches the neighboring compact 3D service icons. | Home and Explore “Tiket” tile, rendered in the existing 54px image slot. |

The asset is decorative. Flight availability and behavior remain controlled by the
existing Admin `flights` setting; this visual correction adds no Admin control or
server-side behavior.

## Travo service icons

Generated with OpenAI ImageGen through Codex using the locked Travo prompt from
`.claude/skills/mascot/scripts/build-prompt.mjs` and the approved
`../home-hero/mascot-v6.png` reference. Each icon leads with a distinct service
object and gives Travo an action specific to the service. The transparent
192 × 192 WebP files render
in the existing mobile slots.

| Surface           | Assets                                                                                                                   | Display |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- |
| Home and Explore  | `services/{esim,shipping-truck,personal-shopper,visa,travel-insurance,flight-plane,attractions,open-trip}-travo-v1.webp` | 54 px   |
| Home eSIM summary | `../esim/esim-pass-global-travo-v1.webp`                                                                                 | 44 px   |

Reviewed 2026-11-20: `services/itinerary-travo-v1.webp` is the 54 px Home and Explore Itinerary icon. OpenAI ImageGen through Codex used the locked mascot prompt and mascot-v6 reference, with Travo leaning over a spiral-bound planner and pointing to the next of two connected stops.

Admin service availability continues to use the existing settings. The image
paths are presentation assets and require no new permissions or migration.
