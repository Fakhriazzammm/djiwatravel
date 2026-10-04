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

export class InMemoryWebhookDedupe {
  private readonly seen = new Set<string>();
  has(event: ProviderWebhook) { return this.seen.has(webhookFingerprint(event)); }
  remember(event: ProviderWebhook) { this.seen.add(webhookFingerprint(event)); }
}
