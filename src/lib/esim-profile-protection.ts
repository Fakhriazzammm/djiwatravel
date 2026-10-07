import { encryptEsimSecret } from "./esim-secret-crypto";
import type { EsimProfileRecord } from "./reseller-repository";

type ProviderProfilePayload = Record<string, unknown>;
const first = (source: ProviderProfilePayload, keys: string[]) => keys.map((key) => source[key]).find((value) => typeof value === "string" && value.length > 0) as string | undefined;

/** Converts provider profile fields into the encrypted DB shape; plaintext is not returned. */
export function protectProviderProfile(orderId: string, payload: ProviderProfilePayload): EsimProfileRecord {
  const nested = (payload["obj"] ?? payload["data"] ?? payload) as ProviderProfilePayload;
  const profile = (nested["esimProfile"] ?? nested["profile"] ?? nested) as ProviderProfilePayload;
  const iccid = first(profile, ["iccid", "ICCID"]);
  const smdp = first(profile, ["smdpAddress", "smdp", "smdp_address"]);
  const activationCode = first(profile, ["activationCode", "activation_code", "ac"]);
  const qrPayload = first(profile, ["qrCode", "qrPayload", "qr_payload", "lpa"]) ?? (smdp && activationCode ? `LPA:1$${smdp}$${activationCode}` : undefined);
  if (!iccid) throw new Error("Response provider tidak berisi ICCID");
  if (!activationCode && !qrPayload) throw new Error("Response provider tidak berisi activation code atau QR payload");
  return {
    orderId, iccid, status: first(profile, ["status", "profileStatus"]) ?? "RELEASED",
    ...(qrPayload ? { qrPayloadEncrypted: encryptEsimSecret(qrPayload) } : {}),
    ...(activationCode ? { activationCodeEncrypted: encryptEsimSecret(activationCode) } : {}),
  };
}
