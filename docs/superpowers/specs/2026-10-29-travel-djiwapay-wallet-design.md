# Djiwa Travel embedded Djiwa Pay wallet

## Intent

When a traveler opens the wallet from Djiwa Travel, render the Djiwa Pay wallet as a seamless, full-bleed page: wallet content remains visible, while the iframe boundary and its surrounding browser chrome are not visually apparent. Keep the Djiwa Travel bottom tab bar visible and use it as the only primary navigation. Djiwa Pay continues to own wallet data and transaction actions.

## Current state and evidence

- Djiwa Travel `/wallet/pay` renders `DjiwaPayBrowser` in page layout. The frame ends above the Travel tab bar.
- Djiwa Pay already detects framed pages and hides its own bottom navigation. Commits `e040a07`, `9e8ecd70`, and `dc3146d0` are present on the Djiwa Pay repository's `main` and `origin/main`.
- Helipod read-only inventory shows separate running VPS records for the `djiwatravel` and `djiwatentram` projects. The public wallet domains respond with HTTP 200.
- Current source uses `djiwapay.web.id` as the Pay origin and allows `pay.djiwatentram.web.id` as a legacy origin.
- The Pay domain response did not show a `Content-Security-Policy` `frame-ancestors` directive or `X-Frame-Options` header. Pay currently hides its own navigation inside any frame; preserve this because the referrer may change during SSO, and use CSP as the authority that permits only Djiwa Travel to frame Pay.
- The Djiwa Pay repository has unrelated uncommitted edits around auth, domains, and deployment. Preserve them and keep this work limited to wallet embedding and its required server headers.

## Goals

- Show one bottom navigation bar, owned by Djiwa Travel, when wallet access begins at `djiwatravel.com`.
- Hide the Djiwa Pay Browser header, footer, panel styling, and visible iframe border in page layout; retain them in sheet layout.
- Let the wallet content fill the available area above the Travel bottom tab bar.
- Keep standalone Djiwa Pay navigation available when users open Pay directly.
- Allow framing only from the approved Djiwa Travel origins.
- Preserve the existing customer-auth bridge, wallet reads, and wallet actions across the two origins.
- Verify the separate Pay and Travel deployment boundaries without mixing their source changes.

## Non-goals

- Rebuild or redesign the wallet interface.
- Move wallet data or transaction APIs to the Djiwa Travel VPS.
- Replace the current customer-auth or Djiwa Pay bridge.
- Deploy unrelated uncommitted changes from the Djiwa Pay repository.

## Approaches

1. **Keep the iframe, make it visually seamless, and secure its boundary (recommended).** The Travel shell already provides the requested navigation, and Pay already suppresses its duplicate nav when framed. Remove the wrapper chrome in page layout and add an allowlist `frame-ancestors` policy. This keeps wallet ownership in Pay and requires changes only where needed.
2. **Render a shared Travel shell inside Pay.** This duplicates or shares navigation code across independently deployed apps and makes the apps more tightly coupled. It adds release coordination without improving the current flow.

Use approach 1.

## Implementation outline

1. Keep `/wallet/pay` as the Travel entry point. In page layout, remove the Djiwa Pay Browser header/footer/panel chrome and make the iframe occupy the full available area between the top safe area and the Travel bottom tab bar. Preserve sheet layout controls.
2. Preserve Pay's existing rule to hide its bottom nav whenever framed. The CSP allowlist blocks unapproved framing, while this rule avoids a duplicate bar if SSO changes the document referrer. Standalone Pay remains unframed and keeps its own nav.
3. Add response security policy on the Pay origin that allows framing only by `https://djiwatravel.com` and `https://www.djiwatravel.com`. Avoid `X-Frame-Options: SAMEORIGIN`, which would block the intended cross-origin embed.
4. Verify the auth bridge, authenticated wallet loading, refresh, and safe navigation back to Travel. Confirm top-up and other wallet actions still call the existing Pay backend.
5. Build Djiwa Travel. Deploy the Travel UI change and Pay's header policy to their separate VPS instances; confirm each service health, response headers, and public routes.

## Acceptance criteria

- Opening Dompet in Djiwa Travel shows exactly one bottom tab bar, with Dompet selected.
- The Djiwa Pay wallet fills the Travel page area without a visible iframe border, Djiwa Pay Browser header, panel, or wrapper footer.
- Direct standalone Djiwa Pay retains its own navigation.
- Djiwa Pay can be framed by the two approved Travel origins and is refused by an unrelated origin.
- An authenticated Travel user sees their existing wallet and can perform the existing wallet actions without losing their session.
- The Pay VPS and Travel VPS are verified and reported separately; unrelated dirty Pay changes remain untouched.

## Open check before implementation

Confirm whether `djiwapay.web.id` is the canonical production host and `pay.djiwatentram.web.id` is legacy-only. The checked-in source currently treats them that way; preserve both until the live redirect and auth bridge behavior are verified.
