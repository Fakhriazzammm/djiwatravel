# Compact destination package deck

## Intent

Make the package picker on `/destination/$code` feel compact, simple, and
informative on mobile. The customer should see more of the neighboring package
cards while still being able to compare the selected package and buy it.

## Goals

- Reduce the package-card footprint and vertical height on the destination page.
- Keep label, quota, duration/quota type, total price, price per day, position
  indicators, selection state, and the buy CTA available.
- Use the existing mobile compact scale and preserve the current carousel,
  selection, duration-filter, and checkout behavior.
- Remove visual weight that is not needed for package comparison.

## Non-goals and anti-goals

- No changes to package selection rules, pricing, loader data, checkout routes,
  or provider/admin configuration.
- No new admin surface is needed: this is presentation-only and the source of
  truth remains the existing destination loader/package data.
- Do not make the cards so small that price or quota becomes hard to scan, and
  do not replace the horizontal picker with a dense table or unrelated redesign.

## Constraints

- Follow `DESIGN.md` → Mobile compact scale and `.claude/skills/djiwa-mobile-ui`.
- Keep touch targets and the full-card button interaction accessible.
- Keep the active package visually distinct without a large gradient or heavy
  shadow; use the existing brand color tokens.
- Preserve unrelated worktree files and do not deploy a stale build artifact.

## Approaches

1. **Compact horizontal deck (selected):** reduce card width to about
   176–188px, use `p-3`, lighter radius/shadow, and a solid brand active state.
   This preserves the current swipe and selection model while showing more of
   the next card.
2. **Mini-row picker:** replace cards with short rows. This is denser but weakens
   the visual hierarchy of the recommended package and changes the established
   interaction model.

The compact horizontal deck was selected because it addresses the reported size
problem with the smallest behavioral risk and keeps the existing package-picker
contract intact.

## Surface matrix

| Surface  | Entry/result                                                   | Source of truth                                  | Permissions                           | States                                                                                  | Proof                                                                    |
| -------- | -------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Customer | Choose duration → select a package card → buy selected package | `Route.useLoaderData()` (`packages`, `picks`)    | Public catalog; no new ownership rule | Existing empty deck, loader/stale, selected/unselected, and checkout link states remain | Focused destination helper test, project suite, production browser smoke |
| Admin    | Not applicable; no setting or data contract changes            | Existing catalog/admin controls remain unchanged | Existing admin permissions unchanged  | No admin state is introduced                                                            | Source diff confirms presentation-only change                            |

## Implementation and verification

- Update only the destination package-deck presentation classes and any focused
  test needed to protect the compact contract.
- Run the focused destination/mobile checks, then the full test/lint/build gate.
- Verify the local built route and the public `/destination/jp?availability=all`
  route after deployment, including the served artifact marker/hash and the
  visible compact carousel/checkout link.
