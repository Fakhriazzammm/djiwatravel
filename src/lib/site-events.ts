import { z } from "zod";

export const SITE_EVENT_NAMES = [
  "page_view",
  "click",
  "finder_submit",
  "checkout_start",
  "destination_view",
] as const;
export type SiteEventName = (typeof SITE_EVENT_NAMES)[number];

const safePath = z
  .string()
  .trim()
  .max(120)
  .regex(/^\/[A-Za-z0-9_/-]*$/);

/** Anonymous by construction: nothing here can identify a visitor beyond a random session id. */
export const siteEventInput = z.object({
  name: z.enum(SITE_EVENT_NAMES),
  path: safePath,
  target: z.string().trim().min(1).max(60).optional(),
  sessionId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{8,64}$/),
  referrerHost: z
    .string()
    .trim()
    .max(100)
    .regex(/^[A-Za-z0-9.-]+$/)
    .optional(),
  utmSource: z
    .string()
    .trim()
    .max(60)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional(),
  device: z.enum(["mobile", "tablet", "desktop", "other"]).default("other"),
});
export type SiteEventInput = z.infer<typeof siteEventInput>;

export type TrafficPeriod = "daily" | "weekly" | "monthly";

export type SiteTraffic = {
  period: TrafficPeriod;
  visitors: number;
  pageViews: number;
  clicks: number;
  checkoutStarts: number;
  finderSubmits: number;
  bounceSessions: number;
  previous: { visitors: number; pageViews: number; clicks: number };
  series: { bucket: string; visitors: number; pageViews: number; clicks: number }[];
  topPages: { path: string; views: number; visitors: number }[];
  sources: { label: string; visitors: number }[];
  devices: { device: string; visitors: number }[];
  topClicks: { target: string; clicks: number }[];
};

/** Share of sessions that viewed exactly one page; null when there are no sessions. */
export function bounceRate(bounceSessions: number, visitors: number): number | null {
  if (visitors <= 0) return null;
  return Math.min(100, Math.round((bounceSessions / visitors) * 100));
}

export function pagesPerSession(pageViews: number, visitors: number): number | null {
  if (visitors <= 0) return null;
  return Math.round((pageViews / visitors) * 10) / 10;
}

/** Device class from the viewport only; no user agent is read or stored. */
export function deviceFromWidth(width: number): "mobile" | "tablet" | "desktop" {
  if (width < 768) return "mobile";
  if (width < 1100) return "tablet";
  return "desktop";
}

/** A click label that is safe to store: a public path or a short plain label, never free text. */
export function sanitizeClickTarget(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().replace(/\s+/g, " ").slice(0, 60);
  if (!value) return null;
  if (value.startsWith("/")) {
    const path = value.split(/[?#]/)[0] ?? "";
    return /^\/[A-Za-z0-9_/-]*$/.test(path) ? path : null;
  }
  return /^[\p{L}\p{N} .,&-]+$/u.test(value) && !/@|\d{6,}/.test(value) ? value : null;
}
