import { createHash } from "node:crypto";

export type EsimProfileStatus = "RELEASED" | "ENABLED" | "IN_USE" | "USED_UP" | "SUSPENDED" | "REVOKED" | "CANCELLED" | "UNKNOWN";
export type ProviderWebhook = { notifyId: string; notifyType: string; eventGenerateTime?: string; content?: Record<string, unknown> };

const rank: Record<EsimProfileStatus, number> = { UNKNOWN: 0, RELEASED: 1, ENABLED: 2, IN_USE: 3, USED_UP: 4, SUSPENDED: 4, CANCELLED: 5, REVOKED: 5 };

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function webhookFingerprint(event: ProviderWebhook) {
  return createHash("sha256").update(stable(event)).digest("hex");
}

export function mapProviderStatus(value: unknown): EsimProfileStatus {
  const status = String(value ?? "").toUpperCase();
  if (status === "ENABLED" || status === "IN_USE" || status === "USED_UP" || status === "SUSPENDED" || status === "REVOKED" || status === "CANCELLED" || status === "RELEASED") return status;
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
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
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

export function normalizeUsagePayload(notifyType: string, content: Record<string, unknown>): NormalizedUsage {
  if (notifyType === "DATA_USAGE") {
    const dataUsage: NonNullable<NormalizedUsage["dataUsage"]> = {};
    const totalVolume = finiteNumber(content["totalVolume"]);
    const orderUsage = finiteNumber(content["orderUsage"]);
    const remain = finiteNumber(content["remain"]);
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
  has(event: ProviderWebhook) { return this.seen.has(webhookFingerprint(event)); }
  remember(event: ProviderWebhook) { this.seen.add(webhookFingerprint(event)); }
}
