---
version: alpha
name: Djiwa Travel Admin
description: Calm operational control room for eSIM fulfillment decisions.
colors:
  primary: "#0A84FF"
  ink: "#111113"
  surface: "#FFFFFF"
  surfaceMuted: "#F4F4F5"
  success: "#34C759"
  warning: "#FF9F0A"
  danger: "#FF3B30"
  border: "#E5E5EA"
typography:
  display:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 2rem
    fontWeight: 700
    lineHeight: 1.1
  body:
    fontFamily: "Inter"
    fontSize: 0.9375rem
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: 14px
  card: 24px
  sheet: 28px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  decision-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.lg}"
---

## Overview

Decision-first operations console for Djiwa Travel eSIM fulfillment. Show impact, freshness, and the next action before decorative density.

## Do's and Don'ts

- Do distinguish zero from unavailable.
- Do show data freshness and scope.
- Do use semantic status colors only for operational meaning.
- Don't invent operational metrics when production data is unavailable.
- Don't expose secrets or raw activation data in admin lists.
