# Home hero assets

Reviewed 2026-11-02. Surface: customer Home hero (`src/components/home-hero.tsx`).

| File | Source / generation | Surface |
| --- | --- | --- |
| `sky-{subuh,pagi,siang,sore,malam,tengah-malam}-v2.jpg` | Generated 2026-11-02 with Helipod AI Gateway, model `seedream-image-v5.0-flash`; prompt "anime sky painting only, painterly Makoto Shinkai style, calm empty gradient in the upper left, cloud masses right and bottom, no land/sea/trees/airplane/people/text"; resized to 800px JPEG q62. | Hero sky per time-of-day phase |
| `mascot-v4.png` | Generated 2026-11-02, same model: adorable furry coral-red airplane monster with two wings, big eyes, red cheeks, smile and a navy pilot cap with goggles, no shadow/ground; white background removed by edge flood-fill, 240px. v1-v3 retired. | Mascot above the search pill |

Text colour: only `pagi` uses dark ink; the other five skies are deep enough in the upper-left for white text (plus a left scrim and soft text shadow in `home-hero.tsx`).
Licence: generated content under the Helipod AI Gateway terms for Djiwa Travel. Phases and Admin pin: `src/lib/home-hero.ts`.
Compression to WebP/AVIF is pending (no encoder in the authoring environment); each file is under the 250KB card budget.
