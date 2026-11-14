# Account-bound eSIM sharing

## Intent

Let the intended recipient claim a shared eSIM once, then reopen it from another browser by signing in to the same Djiwa Travel account. A different account must never receive the eSIM QR or activation code.

## Chosen approach

Keep the share URL as the entry point and keep its public preview minimal. Require a verified Better Auth session for the first claim. The server atomically records `claimed_at` and the session-derived `customer_auth_subject` in `esim_share_links`; browser input never supplies the subject. On later reads, return installation data only when the verified session subject matches the stored subject. A competing claim loses the same atomic update and receives the existing safe `claimed_elsewhere` state.

Add a nullable `claimed_by_subject` column in migration `075_esim_share_claim_account.sql`. Do not backfill old claims: the existing browser cookie is the only verified evidence of who claimed them. Keep cookie validation for legacy rows with `claim_hash` and no subject. New claims use the account identity. This keeps old app versions compatible during deployment and preserves access for recipients already using an older link.

## Customer experience

- Before claim, `/e/$token` shows the existing package preview (name, destination, duration, quota) and no QR, owner, order, price, or recipient identity.
- Reuse the approved Djiwa airplane mascot at `/assets/home-hero/mascot-v6.png`. Keep it within the mobile compact scale. A tap reveals a short Travo security tip; an accessible disclosure explains that signing in saves access to the recipient's account.
- Signed-out recipients use the existing Google sign-in sheet. Its callback returns to the same `/e/$token` URL. Once the session loads, one primary action claims and opens the eSIM.
- On a successful claim, transition to the existing install panel, manual details, quota, and expiry. Show a compact “Tersimpan di akunmu” status and explain that the same account can reopen the link in another browser.
- The open view includes only a non-identifying access mode (`account` or `browser`) so older cookie-bound links receive accurate instructions instead of being described as account-saved.
- A viewer with another account sees “eSIM ini sudah diklaim akun lain,” no installation data, and recovery guidance to use the recipient account or ask the sender for a fresh link. Do not reveal claimant details.
- Show visible pending, retryable network error, unavailable/revoked/expired, and concurrent-claim-lost states. Recheck server state on retry.
- Authentication-service outages return a safe retry state rather than a verified account conflict. After the browser session resolves, recheck access; keep a manual retry available without requiring sign-out.

## Motion and accessibility

Use existing `motion/react` for short entrance and state transitions (opacity and small position change), a one-shot mascot response on claim, and a short disclosure expansion. No continuous loop or parallax. Respect `useReducedMotion`; keep all meaning and controls available when motion is disabled. Maintain focus visibility, 44px touch targets, live status announcements, and a single scroll region.

## Customer/admin surface matrix

| Surface | Entry and result | Control / source of truth | Permissions and states | Proof |
| --- | --- | --- | --- | --- |
| Customer | `/e/$token`: public preview → sign in → claim → install panel; same account can reopen across browsers | `esim_share_links.claimed_at` + nullable `claimed_by_subject`; verified session from `getAuthenticatedUser()` | Preview is minimal; first claim is atomic; only matching account receives QR; another account, legacy cookie claim, revoked/expired link, pending, and retry states are explicit | `src/test/esim-share-server.test.ts`, route UI test, `src/test/mobile-compact-scale.test.ts` |
| Owner | `/my-esim/$id` share sheet; copy/share, see claim time and views, revoke or issue a new link | Same active share row and owner-scoped order | Owner must own the order by verified `customer_auth_subject`; no QR in the share sheet | Existing share sheet tests plus owner authorization coverage |
| Admin | `/admin/orders/$id` inspect claim time/views and revoke; `/admin/settings` retains sharing kill switch | Same share row and `admin_settings.esimSharing` | Admin sees lifecycle status only; never claimant identity, token, QR, or activation code | Admin share server/UI tests; disabled switch still makes customer link unavailable |

The Admin control already exists, so this change updates its status wording and derives “claimed” from `claimed_at` (not only the legacy cookie hash). No new Admin setting or claimant data is needed.

## Data and recovery constraints

- Better Auth's verified server session is the sole recipient identity source. Never accept a customer subject from the browser.
- Keep link token hashing/encryption, owner authorization, eligibility checks, revocation, and the admin kill switch unchanged.
- Historical cookie-only claims remain readable only from the browser holding their existing HttpOnly cookie. A new recipient account cannot adopt them automatically; the sender can revoke and issue a new link.
- Migration is additive and nullable, with no backfill or index. The application rollout runs migrations before swapping the application artifact. App rollback remains safe because the prior version ignores the new column; do not roll the schema back after account-bound claims have been written.

## Out of scope

No change to Better Auth or Djiwa Pay, transfer of an already-claimed legacy link, new mascot generation, or exposure of recipient identity in Admin.

## Review focus

- The matching account receives the same QR on a second browser; a different account and a signed-out viewer never receive it.
- Two simultaneous first claims still produce exactly one winner.
- Existing cookie-bound claims continue to work in their original browser.
- Admin, owner, preview, install and failure states agree on the same claim/revoke/expiry lifecycle.
- At 390×844, the first screen shows the package, primary action, useful package details and security explanation without oversized copy; reduced motion remains usable.
