import { z } from "zod";

export const newCheckoutPaymentMethodSchema = z.enum(["qris", "djiwa_pay"]);
export type NewCheckoutPaymentMethod = z.infer<typeof newCheckoutPaymentMethodSchema>;
export type StoredPaymentMethod = NewCheckoutPaymentMethod | "va";

export function storedPaymentMethod(value: unknown): StoredPaymentMethod {
  if (value === "djiwa_pay") return "djiwa_pay";
  if (value === "va") return "va";
  return "qris";
}

export function mayarOrderPaymentAllowed(value: unknown) {
  return value === "qris" || value === "va";
}

/** Return the exact provider URL only for payment methods settled through Mayar. */
export function mayarRedirectUrl(method: unknown, paymentUrl: unknown): string | null {
  if (!mayarOrderPaymentAllowed(method) || typeof paymentUrl !== "string" || !paymentUrl) return null;
  return paymentUrl;
}

export function walletPaymentAvailability(input: {
  enabled: boolean;
  authenticated: boolean;
  profileComplete: boolean;
}): "available" | "unconfigured" | "sign_in" | "complete_profile" {
  if (!input.enabled) return "unconfigured";
  if (!input.authenticated) return "sign_in";
  if (!input.profileComplete) return "complete_profile";
  return "available";
}

export function djiwaPayOrderOwnedBy(
  order: { paymentMethod: string | null; customerAuthSubject: string | null },
  authSubject: string,
) {
  const subject = authSubject.trim();
  return order.paymentMethod === "djiwa_pay" && Boolean(subject) && order.customerAuthSubject === subject;
}

export const walletPaymentInputSchema = z.object({ orderId: z.string().uuid() }).strict();
