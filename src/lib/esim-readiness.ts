export type InstallableProfile = {
  iccid?: string | null;
  qrPayloadEncrypted?: string | null;
  activationCodeEncrypted?: string | null;
  smdpAddress?: string | null;
};

/** READY is a fulfillment claim, not merely a provider status. */
export function isInstallableProfile(profile: InstallableProfile | null | undefined) {
  if (!profile?.iccid) return false;
  return Boolean(profile.qrPayloadEncrypted || (profile.smdpAddress && profile.activationCodeEncrypted));
}
