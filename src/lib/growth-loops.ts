/**
 * Wave 8 privacy/consent primitives. These are deliberately provider-neutral: no message, referral
 * payout, coupon, or push side effect is allowed until the corresponding external contract exists.
 */
export type LifecycleMessage = "payment_received" | "esim_ready" | "installation_help";
export type Consent = { lifecycle: boolean; marketing: boolean };

export function messageDeduplicationKey(orderId: string, message: LifecycleMessage) {
  return `travel:${orderId}:${message}`;
}

export function canSendLifecycleMessage(consent: Consent, message: LifecycleMessage) {
  // Transactional installation/payment updates require explicit lifecycle consent. Marketing is
  // intentionally not a fallback: no promotional message may piggyback on an operational event.
  return consent.lifecycle === true && Boolean(message);
}

export function normalizeCampaignAttribution(input: Record<string, string | null | undefined>) {
  const out: Record<string, string> = {};
  for (const key of [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "referrer",
    "landing_path",
  ] as const) {
    const value = input[key]?.trim();
    if (value) out[key] = value.slice(0, 100);
  }
  return out;
}

export function referralRewardEligibility(input: {
  installationConfirmed: boolean;
  fraudHold: boolean;
  rewardLedgerEnabled: boolean;
}) {
  // Never promise a payout before the installation event and a fraud-controlled ledger exist.
  if (!input.rewardLedgerEnabled) return { eligible: false, reason: "ledger_not_enabled" as const };
  if (input.fraudHold) return { eligible: false, reason: "fraud_hold" as const };
  if (!input.installationConfirmed)
    return { eligible: false, reason: "installation_not_confirmed" as const };
  return { eligible: true, reason: "eligible" as const };
}
