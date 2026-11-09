# Home hero assets

Reviewed 2026-11-02. Surface: customer Home hero (`src/components/home-hero.tsx`).

| File | Source / generation | Surface |
| --- | --- | --- |
| `sky-{subuh,pagi,siang,sore,malam,tengah-malam}-v2.jpg` | Generated 2026-11-02 with Helipod AI Gateway, model `seedream-image-v5.0-flash`; prompt "anime sky painting only, painterly Makoto Shinkai style, calm empty gradient in the upper left, cloud masses right and bottom, no land/sea/trees/airplane/people/text"; resized to 800px JPEG q62. | Hero sky per time-of-day phase |
| `mascot-v6.png` | Generated 2026-11-02 with Helipod, model `seedream-image-v5.0-flash`, by the fixed mascot base prompt (see `.claude/skills/mascot/SKILL.md`): cute furry plush airplane, red egg-shaped body, smooth round face with no nose, two stubby wings, brown leather pilot cap with goggles. White background removed by edge flood-fill, cropped, mirrored horizontally so it faces left, 240px. v1-v5 retired. | Mascot above the search pill |
| `mascot-map-v1.png` | Generated 2026-11-08 with Helipod, model `seedream-image-v5.0-flash`, by the fixed mascot base prompt plus extras: "a small paper map", "flying upward at 20 degrees", "centered in the frame, medium size". Background removed, cropped, mirrored to face left, 240px. | Mascot loader (`mascot-loader.tsx`) |
| `mascot-ai-v1.png`, `mascot-ai-think-v1.png` | Generated 2026-11-09 with Helipod, model `seedream-image-v5.0-flash`, by the fixed mascot base prompt plus extras: "pose and motion: close-up portrait, facing the viewer; placement: head and upper body filling the frame, centered" (v1) and "pose and motion: thinking, tilting slightly and looking upward; placement: centered, upper body" (think). Background removed by `cutout.mjs` (not mirrored), 360px; v1 also cropped under the body to drop the generated floor shadow. A third pose ("bouncing happily and waving hello") drifted (a snout and legs appeared) and was discarded. Rp 320 per image. | Travo (the assistant): avatar and profile in the Ringkas chat (`assistant-mascot.tsx`) |

Text colour: only `pagi` uses dark ink; the other five skies are deep enough in the upper-left for white text (plus a left scrim and soft text shadow in `home-hero.tsx`).
Licence: generated content under the Helipod AI Gateway terms for Djiwa Travel. Phases and Admin pin: `src/lib/home-hero.ts`.
Compression to WebP/AVIF is pending (no encoder in the authoring environment); each file is under the 250KB card budget.
