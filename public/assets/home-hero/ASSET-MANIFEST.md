# Home hero assets

Reviewed 2026-11-02. Surface: customer Home hero (`src/components/home-hero.tsx`).

| File | Source / generation | Surface |
| --- | --- | --- |
| `sky-subuh-v1.jpg`, `sky-pagi-v1.jpg`, `sky-siang-v1.jpg`, `sky-malam-v1.jpg`, `sky-tengah-malam-v1.jpg` | Generated with Helipod AI Gateway, model `seedream-image-v5.0-flash`, prompt style "Makoto Shinkai / Ghibli anime background painting, tropical bay, tiny red paper airplane, no text, no people"; resized to 800px JPEG q62. | Hero sky per time-of-day phase |
| `sky-sore-v1.jpg` | Same model, earlier "pastel dusk" prompt. | Hero sky, sore phase |
| `mascot-v1.png` | Same model, "cute 3D clay red paper-airplane mascot with traveler hat"; white background removed by edge flood-fill, 300px. | Mascot beside the search pill |

Licence: generated content under the Helipod AI Gateway terms for Djiwa Travel. Phases and Admin pin: `src/lib/home-hero.ts`.
Compression to WebP/AVIF is pending (no encoder in the authoring environment); each file is under the 250KB card budget.
