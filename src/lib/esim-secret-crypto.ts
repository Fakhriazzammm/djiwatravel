import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const VERSION = "v1";

function keyFromEnvironment() {
  const raw = process.env["ESIM_PROFILE_ENCRYPTION_KEY"];
  if (!raw) throw new Error("ESIM_PROFILE_ENCRYPTION_KEY belum dikonfigurasi");
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ESIM_PROFILE_ENCRYPTION_KEY harus 32 byte (64 hex atau base64)");
  return key;
}

function encode(value: Buffer) { return value.toString("base64url"); }
function decode(value: string) { return Buffer.from(value, "base64url"); }

/** Encrypt QR/LPA and activation code; plaintext never belongs in the database. */
export function encryptEsimSecret(plaintext: string) {
  if (!plaintext) throw new Error("Tidak boleh mengenkripsi secret kosong");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, keyFromEnvironment(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, encode(iv), encode(cipher.getAuthTag()), encode(ciphertext)].join(":");
}

export function decryptEsimSecret(payload: string) {
  const [version, ivEncoded, tagEncoded, ciphertextEncoded] = payload.split(":");
  if (version !== VERSION || !ivEncoded || !tagEncoded || !ciphertextEncoded) throw new Error("Format secret eSIM tidak valid");
  const decipher = createDecipheriv(ALGORITHM, keyFromEnvironment(), decode(ivEncoded));
  decipher.setAuthTag(decode(tagEncoded));
  return Buffer.concat([decipher.update(decode(ciphertextEncoded)), decipher.final()]).toString("utf8");
}

/** Stable, non-reversible identifier for audit/deduplication without exposing the secret. */
export function fingerprintEsimSecret(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }
