# Live eSIM Country Catalog Design

## Intent

Customer Finder and destination pages must expose every country that has at least one valid,
sellable package in the live eSIMAccess catalog. The provider catalog remains the source of truth
for package availability and commercial terms; local metadata enriches known countries only.

## Goals

- Derive display destinations from live package `locationCodes`, not only the 13 seeded entries.
- Preserve Indonesian names, flags, aliases, and regional behavior for known destinations.
- Provide safe fallback metadata for newly returned country codes.
- Reuse the existing cached, price-validating, balance-aware package pipeline.
- Keep degraded provider reads fail-open to the existing seed list.

## Non-goals

- No provider credentials, package prices, or country data in client bundles beyond the selected
  destination's sanitized view model.
- No database migration or duplicate package catalog.
- No changes to ordering, payment, provisioning, or provider API authentication.

## Approach

Use a dynamic projection layer: collect country codes from sellable live packages, resolve each code
through existing local metadata when present, and synthesize a neutral fallback destination when it
is new. Regional entries remain explicit seed destinations and continue using their existing bundle
coverage rules. Destination pages query the live catalog and therefore show the package set for any
newly projected country.

## Constraints and safety

- Only packages passing `isRecommendablePackage` and sellability filtering contribute destinations.
- Unknown codes use a globe flag, the provider code as display name, and region `Lainnya`.
- An empty/degraded live read returns the existing seed list rather than an empty storefront.
- The change must remain server-side until sanitized destination/package view data is returned.

## Acceptance

Given a live package with a country code absent from `src/lib/catalog.ts`, Finder lists that country,
opening its destination route succeeds, and the route shows the package. Existing metadata and
regional tests remain green.
