import { createHash, createHmac } from "node:crypto";

export type EsimProfileStatus =
  | "RELEASED"
  | "ENABLED"
  | "IN_USE"
  | "USED_UP"
  | "SUSPENDED"
  | "EXPIRED"
  | "REVOKED"
  | "CANCELLED"
  | "UNKNOWN";
export type ProviderWebhook = {
  notifyId: string;
  notifyType: string;
  eventGenerateTime?: string;
  content?: Record<string, unknown>;
};

export const ESIM_ACCESS_WEBHOOK_TYPES = new Set([
  "CHECK_HEALTH",
  "ORDER_STATUS",
  "ESIM_STATUS",
  "SMDP_EVENT",
  "DATA_USAGE",
  "VALIDITY_USAGE",
]);

const WEBHOOK_CONTENT_KEYS = [
  "orderNo",
  "transactionId",
  "esimTranNo",
  "orderStatus",
  "esimStatus",
  "smdpStatus",
  "eid",
  "timestamp",
  "seqNumber",
  "notifyStatus",
  "totalVolume",
  "orderUsage",
  "remain",
  "remainVolume",
  "remainThreshold",
  "lastUpdateTime",
  "durationUnit",
  "totalDuration",
  "expiredTime",
  "packageCode",
] as const;

const rank: Record<EsimProfileStatus, number> = {
  UNKNOWN: 0,
  RELEASED: 1,
  ENABLED: 2,
  IN_USE: 3,
  USED_UP: 4,
  SUSPENDED: 4,
  EXPIRED: 5,
  CANCELLED: 5,
  REVOKED: 5,
};

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function scalar(value: unknown): string | number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 240);
  return undefined;
}

/** Normalize the provider envelope while keeping ICCID out of persisted event payloads. */
export function normalizeProviderWebhook(raw: unknown, secret: string): ProviderWebhook | null {
  const input = recordOf(raw);
  if (!input) return null;
  const notifyType = String(input.notifyType ?? "")
    .trim()
    .toUpperCase();
  if (!ESIM_ACCESS_WEBHOOK_TYPES.has(notifyType)) return null;
  const sourceContent = recordOf(input.content) ?? {};
  const content: Record<string, unknown> = {};
  for (const key of WEBHOOK_CONTENT_KEYS) {
    const value = scalar(sourceContent[key]);
    if (value !== undefined) content[key] = value;
  }
  const iccid = scalar(sourceContent.iccid);
  if (iccid !== undefined) {
    content.iccidHash = createHmac("sha256", secret).update(String(iccid)).digest("hex");
  }
  const eventGenerateTime = scalar(input.eventGenerateTime);
  const suppliedId = scalar(input.notifyId);
  const stableId = createHash("sha256")
    .update(JSON.stringify({ notifyType, eventGenerateTime, content }))
    .digest("hex");
  return {
    notifyId: suppliedId === undefined ? stableId : String(suppliedId),
    notifyType,
    ...(eventGenerateTime === undefined ? {} : { eventGenerateTime: String(eventGenerateTime) }),
    content,
  };
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export function webhookFingerprint(event: ProviderWebhook) {
  return createHash("sha256").update(stable(event)).digest("hex");
}

export function mapProviderStatus(value: unknown): EsimProfileStatus {
  const status = String(value ?? "").toUpperCase();
  if (status === "GOT_RESOURCE") return "RELEASED";
  if (
    status === "ENABLED" ||
    status === "IN_USE" ||
    status === "USED_UP" ||
    status === "SUSPENDED" ||
    status === "REVOKED" ||
    status === "CANCELLED" ||
    status === "RELEASED"
  )
    return status;
  if (status === "UNUSED_EXPIRED" || status === "USED_EXPIRED") return "EXPIRED";
  if (status === "CANCEL") return "CANCELLED";
  return "UNKNOWN";
}

export function shouldApplyProfileStatus(current: EsimProfileStatus, incoming: EsimProfileStatus) {
  return incoming !== "UNKNOWN" && (current === "UNKNOWN" || rank[incoming] >= rank[current]);
}

export type NormalizedUsage = {
  dataUsage?: { totalVolume?: number; orderUsage?: number; remain?: number };
  validityUsage?: { totalDuration?: number; expiredTime?: string; remain?: number };
};

function finiteNumber(value: unknown): number | undefined {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function normalizedTimestamp(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value < 10_000_000_000 ? value * 1000 : value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value.trim());
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
}

export function normalizeUsagePayload(
  notifyType: string,
  content: Record<string, unknown>,
): NormalizedUsage {
  if (notifyType === "DATA_USAGE") {
    const dataUsage: NonNullable<NormalizedUsage["dataUsage"]> = {};
    const totalVolume = finiteNumber(content["totalVolume"]);
    const orderUsage = finiteNumber(content["orderUsage"]);
    const remain = finiteNumber(content["remain"] ?? content["remainVolume"]);
    if (totalVolume !== undefined) dataUsage.totalVolume = totalVolume;
    if (orderUsage !== undefined) dataUsage.orderUsage = orderUsage;
    if (remain !== undefined) dataUsage.remain = remain;
    return Object.keys(dataUsage).length ? { dataUsage } : {};
  }
  if (notifyType === "VALIDITY_USAGE") {
    const validityUsage: NonNullable<NormalizedUsage["validityUsage"]> = {};
    const totalDuration = finiteNumber(content["totalDuration"]);
    const expiredTime = normalizedTimestamp(content["expiredTime"]);
    const remain = finiteNumber(content["remain"]);
    if (totalDuration !== undefined) validityUsage.totalDuration = totalDuration;
    if (expiredTime !== undefined) validityUsage.expiredTime = expiredTime;
    if (remain !== undefined) validityUsage.remain = remain;
    return Object.keys(validityUsage).length ? { validityUsage } : {};
  }
  return {};
}

export class InMemoryWebhookDedupe {
  private readonly seen = new Set<string>();
  has(event: ProviderWebhook) {
    return this.seen.has(webhookFingerprint(event));
  }
  remember(event: ProviderWebhook) {
    this.seen.add(webhookFingerprint(event));
  }
}
