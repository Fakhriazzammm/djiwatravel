# eSIM Home Summary Motion Design

## Intent

Make the existing Beranda eSIM summary card feel more polished and recognizable with a calm iOS-style gray surface, a colored 3D eSIM illustration, and a slow floating loop.

## Scope

- Keep the existing empty, active, low-quota, pending, ready, history, and multi-order behavior and destinations.
- Add the generated colored eSIM image to the card states as decorative artwork.
- Animate only the artwork with a small, continuous vertical drift and tilt. Disable the loop when reduced motion is requested.
- Keep loading/data logic, navigation, navbar, and server behavior unchanged.

## Approaches

- Chosen: use the existing `motion/react` dependency to animate the image; optimize the generated transparent asset and record its provenance in the asset manifest. This directly matches the approved prototype and avoids a new dependency.
- Alternative: use CSS keyframes and the existing travel-pass image. This is lighter in implementation but cannot use the requested Motion API and does not use the approved colored eSIM-chip artwork.

## Constraints

- Use the existing neutral `secondary` surface and foreground/border tokens; retain semantic status colors and the Djiwa primary action.
- Keep the icon within a fixed responsive slot with intrinsic dimensions, empty alt text, and a non-animated fallback.
- Motion must remain subtle, never move the card or obscure copy, and stop under `prefers-reduced-motion`.
- Keep the generated small icon below 100 KB when feasible; no backend, schema, or package changes.

## Review focus

- Empty cards still show the search and catalogue actions clearly.
- Active quota, status, expiry, and order-selection behavior remain unchanged.
- Pending, ready, history, and loading states do not shift or hide their actions.
- Missing/slow image loading leaves the text and card layout intact.
- Reduced-motion users see a static icon.
