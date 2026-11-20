import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure rules for Helipod Email webhooks: the signature check, reading an event, and which outcome
 * wins when events arrive twice or out of order. No network, no database.
 * Contract: https://docs.helipod.io/docs/email-api/webhooks
 */

export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** `Helipod-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`. */
export function verifyHelipodSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowMs = Date.now(),
  toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS,
): boolean {
  if (!header || !secret) return false;
  const parts: Record<string, string> = {};
  for (const piece of header.split(",")) {
    const index = piece.indexOf("=");
    if (index > 0) parts[piece.slice(0, index).trim()] = piece.slice(index + 1).trim();
  }
  const t = Number(parts["t"]);
  if (!Number.isFinite(t) || t <= 0) return false;
  if (Math.abs(nowMs / 1000 - t) > toleranceSeconds) return false;
  const provided = parts["v1"] ?? "";
  if (!/^[0-9a-f]{64}$/i.test(provided)) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const given = Buffer.from(provided, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Signs a body the way Helipod does (used by tests and for a manual check). */
export function signHelipodBody(rawBody: string, secret: string, nowMs = Date.now()) {
  const t = Math.floor(nowMs / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

export type DeliveryStatus = "delivered" | "bounced" | "complained" | "rejected" | "failed";

export type HelipodEmailEvent = {
  type: string;
  occurredAt: string | null;
  messageId: string | null;
  recipients: string[];
  subject: string | null;
  /** Short readable reason (bounce diagnostic, complaint type, reject reason). */
  detail: string | null;
};

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const EVENT_TYPE = /^email\.[a-z_]{3,24}$/;

/** Reads one webhook body; null when it is not an email event we understand. */
export function parseHelipodEvent(body: unknown): HelipodEmailEvent | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const type = text(raw["type"], 40);
  if (!EVENT_TYPE.test(type)) return null;
  const data = (raw["data"] && typeof raw["data"] === "object" ? raw["data"] : {}) as Record<
    string,
    unknown
  >;
  const notification = (
    data["notification"] && typeof data["notification"] === "object" ? data["notification"] : {}
  ) as Record<string, unknown>;
  const mail = (
    notification["mail"] && typeof notification["mail"] === "object" ? notification["mail"] : {}
  ) as Record<string, unknown>;
  const recipients = (Array.isArray(data["recipients"]) ? data["recipients"] : [])
    .map((value) => text(value, 254).toLowerCase())
    .filter((value) => value.includes("@"))
    .slice(0, 50);
  const bounce = (notification["bounce"] ?? null) as Record<string, unknown> | null;
  const complaint = (notification["complaint"] ?? null) as Record<string, unknown> | null;
  const reject = (notification["reject"] ?? null) as Record<string, unknown> | null;
  const bounceRecipient = Array.isArray(bounce?.["recipients"])
    ? ((bounce!["recipients"] as unknown[])[0] as Record<string, unknown> | undefined)
    : undefined;
  const detail =
    text(bounceRecipient?.["diagnosticCode"], 180) ||
    text(bounce?.["bounceType"], 60) ||
    text(complaint?.["complaintFeedbackType"], 60) ||
    text(reject?.["reason"], 120) ||
    text(notification["error"], 180) ||
    null;
  const created = text(raw["createdAt"], 40);
  return {
    type,
    occurredAt:
      created && !Number.isNaN(Date.parse(created)) ? new Date(created).toISOString() : null,
    messageId: text(data["messageId"], 120) || null,
    recipients,
    subject: text(mail["subject"], 300) || null,
    detail,
  };
}

const STATUS: Record<string, DeliveryStatus> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.rejected": "rejected",
  "email.failed": "failed",
};

/** The outcome an event sets on an email, or null for events that only get recorded (sent, opened...). */
export const deliveryStatusFor = (type: string): DeliveryStatus | null => STATUS[type] ?? null;

/** A delivery acknowledgement never overrides a bounce or complaint that arrived first. */
export const overridesDelivered = (status: DeliveryStatus) => status !== "delivered";

/** One key per event and recipient: Helipod may deliver the same event more than once. */
export const eventKey = (type: string, messageId: string | null, recipient: string) =>
  `${type}|${messageId ?? "-"}|${recipient}`;
