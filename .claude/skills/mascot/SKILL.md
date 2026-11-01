---
name: mascot
description: Generate the Djiwa Travel furry airplane mascot with Helipod (Seedream) in a new pose, motion, placement, or with an added object, without changing the character. Use when asked to make, redraw, or add something to the mascot, or to produce a new transparent mascot asset for the Home hero or elsewhere.
---

# Djiwa Travel mascot generator

The mascot is a cute furry plush airplane (red egg-shaped body, smooth round face with no nose,
two stubby wings, white tummy, brown leather pilot cap with goggles). The character is **locked**
by one base prompt. You may add an object, a pose/motion, or a placement; you may not describe,
reword, or reorder the character.

## Locked settings

| Field | Value |
| --- | --- |
| model | `seedream-image-v5.0-flash` |
| projectId | `7f6dbc1d-16dc-4774-a1a2-15c8d9478f8e` |
| size | `2048x2048` |
| base prompt | in `scripts/build-prompt.mjs` (`BASE_PROMPT`), verbatim from the approved option B (2026-11-02) |

The base prompt makes the mascot face **right** on a flat white background. The site shows it
facing **left**, so production assets are mirrored with `--flip` at the cutout step.

## Workflow

1. **Build the prompt** (never hand-write it). From this skill's `scripts/` directory:

   ```bash
   node build-prompt.mjs --object "a small paper map" \
                         --pose "flying upward with a happy wink" \
                         --position "small, in the lower right of the frame"
   ```

   - `--object`: something added next to or held by the mascot ("a small paper map", "a suitcase").
   - `--pose`: pose or motion ("flying upward at 20 degrees", "waving one wing", "diving").
   - `--position`: where it sits in the frame, or the camera ("small in the lower right").
   - `--extra`: any other addition that is not the character itself (for example "a few sparkles").
   - With no flags it prints the unchanged base prompt (use that to regenerate the original look).

   The script rejects extras that mention the nose/snout/propeller, wings, eyes, cheeks, cap,
   fur colour, background, shadow, ground or text, and "facing left". If a request needs one of
   those, tell the user it would change the character and offer the closest allowed wording
   (a new background is a separate scene image, not part of the mascot asset).

2. **Confirm cost first.** Helipod image generation costs money (about Rp 320 per image on this
   model). Load the tool with ToolSearch (`select:mcp__helipod__generate_ai_image`), call it with
   `dryRun: true` for the price, tell the user, and wait for an explicit yes. A new request for a
   different image needs its own yes. If asked for several alternatives, run them as separate
   calls (the model returns one image per call).

3. **Generate.** Call `generate_ai_image` with the JSON from step 1 (`model`, `projectId`, `size`,
   `prompt`). Show the result to the user. Images on Helipod are deleted after 7 days: download
   the chosen ones.

4. **Make the asset** (macOS: uses `sips`):

   ```bash
   curl -sL -o /tmp/mascot-src.jpg "<image url>"
   node cutout.mjs /tmp/mascot-src.jpg <repo>/public/assets/home-hero/mascot-vN.png --flip --max 240
   ```

   `cutout.mjs` removes the white background (edge flood-fill, so eye highlights and the tummy
   survive), crops to the figure, resizes, and mirrors with `--flip`. Open the PNG and check the
   edges before using it. Use a **new version number every time** (`mascot-v7.png`, ...), never
   overwrite, so browser caches refresh.

5. **Wire it in** (only if the user wants it live):
   - `HERO_MASCOT` in `src/lib/home-hero.ts` → the new file.
   - `width`/`height` of the mascot `<motion.img>` in `src/components/home-hero.tsx` to the new
     aspect ratio. Do **not** change the launch animation (wind-up, fly toward the viewer, sheet
     opens after the flight, spring return).
   - `public/assets/home-hero/ASSET-MANIFEST.md`: one row with source, prompt extras, date, and
     the retired versions. Delete the old version file.

6. **Release** per `AGENTS.md`: tests (`npx vitest run src/test/home-hero.test.ts`), commit only the
   mascot files, push, `scripts/deploy-vps.sh`, then check the live page. Report local, commit,
   push and deploy separately. Do not push or deploy unless the user asked.

## Consistency tips

- For extra stability across images, pass an earlier approved mascot image as a reference
  (`images: ["https://..."]`; this model accepts up to 4). Helipod links expire after 7 days, so
  only use a link that is still valid. Approved reference: request
  `req_4581e2e3-cc04-4cee-929c-0e48fcd3a2f8` (option B, valid until 2026-11-08).
- If the character drifts (nose appears, wings count changes, cap changes), regenerate with the
  same extras once; do not "fix" it by editing the base prompt.
- Keep extras short and physical. One object and one pose per image generates the most reliably.

## Files

- `scripts/build-prompt.mjs`: locked base prompt, extras validation, request JSON.
- `scripts/cutout.mjs`: background removal, crop, resize, mirror.
