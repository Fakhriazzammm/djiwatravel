import { z } from "zod";

export const HOME_ESIM_EVENT_NAMES = [
  "home_esim_chip_tap",
  "home_esim_sheet_open",
  "home_esim_promo_tap",
] as const;
export type HomeEsimEventName = (typeof HOME_ESIM_EVENT_NAMES)[number];

export function isHomeEsimEvent(name: string): name is HomeEsimEventName {
  return (HOME_ESIM_EVENT_NAMES as readonly string[]).includes(name);
}

/** Anonymous by construction: nothing here can identify a customer. */
export const homeEsimEventInput = z.object({
  name: z.enum(HOME_ESIM_EVENT_NAMES),
  destination: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/)
    .optional(),
  source: z.enum(["rail", "search", "promo"]).optional(),
});
export type HomeEsimEventInput = z.infer<typeof homeEsimEventInput>;

export type HomeEsimFunnel = {
  days: number;
  chipTaps: number;
  sheetOpens: number;
  promoTaps: number;
  topDestinations: { code: string; sheetOpens: number }[];
  /** Orders created in the same window, for context only: events carry no order link. */
  ordersInWindow: number | null;
};

export function funnelRates(funnel: Pick<HomeEsimFunnel, "chipTaps" | "sheetOpens">) {
  return {
    chipToSheet:
      funnel.chipTaps > 0
        ? Math.min(100, Math.round((funnel.sheetOpens / funnel.chipTaps) * 100))
        : null,
  };
}
