# Google-only Travel sign-in design

## Intent

Make sign-in and first-time registration feel quick and consistent across Djiwa Travel while keeping Better Auth on the shared Djiwa Tentram auth service as the single identity source.

## Current behavior

- The home header has a compact “Masuk atau daftar” button.
- `CustomerAuth` opens a centered dialog with one Google action.
- Google OAuth always returns to `/profile`, even when sign-in began on another page.
- Several routes pass `onAuthenticated`, but the redirect-based OAuth component cannot call it; the prop is unused.

## Goals

- Keep Google as the only sign-in and registration method in Travel.
- Keep the home header CTA and contextual sign-in prompts on Profile and My Trips.
- Use a safe-area-aware bottom sheet on mobile and a centered dialog on desktop.
- Return Google OAuth to the same Travel URL that started sign-in.
- Explain that one Travel account covers saved trips, orders, eSIM, and Djiwa Pay.

## Non-goals

- Add email/password, username-based routes, a new auth backend, or an automatic login popup.
- Change Djiwa Pay or the shared Better Auth service.

## Approaches

1. Keep a centered dialog at every viewport. This is the smallest change but does not match the mobile-first sheet pattern used elsewhere.
2. Use one responsive dialog surface: bottom sheet on mobile, centered modal on desktop (**recommended and selected**). It preserves the existing trigger and Google OAuth while improving mobile ergonomics.
3. Add separate login and registration pages. This adds choices and duplicated auth UI despite Google OAuth already serving both first-time and returning users.

## Selected details

- The compact home CTA stays in the top-right header; the existing Profile and My Trips prompts open the same component.
- The sheet contains one Google action and short benefit copy; no separate login/register tabs.
- OAuth callback uses the current same-origin URL, preserving path, query, and hash.
- Remove the unused `onAuthenticated` prop and its pass-throughs; after OAuth, the page reloads and reads the shared session as it does today.
- Keep guest browsing and guest checkout unchanged.

## Acceptance

- Google-only CTA opens the responsive auth surface.
- Home, Profile, and My Trips compile with the shared component and return to their starting URL after OAuth.
- OAuth loading and failure feedback remain visible and accessible.
- Production build succeeds. No test suite is run unless requested.
