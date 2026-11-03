# Agenda assets

| File | Source | Prompt extras | Date |
| --- | --- | --- | --- |
| `mascot-agenda-v4.png` | Helipod `seedream-image-v5.0-pro` 1536x1536 with `mascot-v6.png` as the reference image, request `req_7a1e8dec-408a-46fb-abc0-3b05f6239d61`, via the `mascot` skill (source cropped at the ledge line, `cutout.mjs --flip --max 360`) | object: a small pencil; extra: exactly the same character as the reference image; pose: leaning forward, peeking over an edge and looking down; position: top half visible, cut off by the bottom edge | 2026-11-04 |

Used on the trip Agenda, peeking over the top edge of the map (`src/routes/my-trips.$tripId.$section.tsx`). Use a new version number for any replacement. Retired: `v1` (white face) and `v2` (proportions drifted), both generated without a reference image; `v3` (sitting with a calendar, floated beside the title).
