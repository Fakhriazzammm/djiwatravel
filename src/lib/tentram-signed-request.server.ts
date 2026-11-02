import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies a server-to-server request signed by Djiwa Tentram (the Pay VPS).
 *
 * Shared by every internal endpoint Tentram calls so the scheme stays in one place:
 * `x-djiwa-source: djiwa-tentram`, a fresh `x-djiwa-timestamp` (5 minute window) and an HMAC-SHA256
 * of `${timestamp}.${rawBody}` in `x-djiwa-signature`, keyed by DJIWA_TRAVEL_CALLBACK_SECRET.
 */
const REPLAY_WINDOW_SECONDS = 300;

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyTentramSignedRequest(rawBody: string, request: Request): boolean {
  if ((request.headers.get("x-djiwa-source") || "") !== "djiwa-tentram") return false;
  const secret = process.env["DJIWA_TRAVEL_CALLBACK_SECRET"] || "";
  const timestamp = request.headers.get("x-djiwa-timestamp") || "";
  const signature = request.headers.get("x-djiwa-signature") || "";
  const seconds = Number(timestamp);
  if (!secret || !/^\d+$/.test(timestamp) || !Number.isSafeInteger(seconds)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - seconds) > REPLAY_WINDOW_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return safeEqual(signature, expected);
}
