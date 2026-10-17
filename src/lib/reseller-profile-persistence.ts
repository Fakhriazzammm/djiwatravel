import { protectProviderProfile } from "./esim-profile-protection";
import type { ResellerRepository } from "./reseller-repository";

/** Persist only encrypted profile secrets after provider provisioning/query response. */
export async function persistProviderProfile(
  repo: ResellerRepository,
  orderId: string,
  providerPayload: Record<string, unknown>,
) {
  const profile = protectProviderProfile(orderId, providerPayload);
  await repo.saveProfile(profile);
  return { orderId: profile.orderId, iccid: profile.iccid, status: profile.status };
}
