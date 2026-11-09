# Illustrated share assets

Reviewed 2026-11-10 against the user-approved compact design 4 (Ilustrasi Tokyo).

| Asset                             | Source / rights                                                                                                                                                                                                          | Usage                                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokyo-illustration-v1.webp`      | OpenAI image generation, derived from the approved illustrated-poster reference; text-free painted autumn Tokyo montage. Source generation `exec-24ced267-493b-4660-bdcb-474295eeb887.png`; WebP encoded at quality .84. | Only trips whose title identifies Tokyo. It is decorative illustration, not a location photo or map. No member name, itinerary, date, logo or mascot is baked into it. 146,410 bytes. |
| `travel-sky-illustration-v1.webp` | OpenAI image generation; original neutral painted cloudscape and aircraft, no country-specific landmark. Source generation `exec-d8d9040f-69fb-4556-8691-21e184af371c.png`; WebP encoded at quality .84.                 | Brand share posters and fallback for other destinations. 43 KB.                                                                                                                       |
| `dm-serif-display-v1.ttf`         | DM Serif Display by Colophon Foundry, from Google Fonts (`ofl/dmserifdisplay`), SIL Open Font License 1.1 included in `DM-Serif-Display-OFL.txt`.                                                                        | Self-hosted canvas headline/activity serif. Loaded only on image export; falls back to Georgia/system serif if unavailable. 70,348 bytes.                                             |

The original Djiwa logo remains `src/assets/logo.png`; original Travo remains
`/assets/home-hero/mascot-v6.png`. Renderers add live text separately. The assets
are generated once during development: customers do not call an AI image API
when exporting. No third-party font request is made during export.

Generation briefs: Tokyo background contains mostly clean pale sky above a
Sensō-ji/Skytree painted montage and fades into cream; neutral background is a
cloudscape with a small aircraft and no specific city. Both expressly exclude
text, brand marks, mascot and itinerary data. WebP conversion changes encoding
and size, not the art direction.
