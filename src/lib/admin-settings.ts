export type AdminSettingKey =
  | "retryPolicy"
  | "expiryPolicy"
  | "maintenanceMode"
  | "checkoutKillSwitch"
  | "provisioningKillSwitch"
  | "fx"
  | "markup"
  | "paymentExpiry"
  | "providerThreshold"
  | "notifications"
  | "security";
export type AdminSettings = Record<AdminSettingKey, unknown>;
export const ADMIN_SETTING_KEYS: AdminSettingKey[] = [
  "retryPolicy",
  "expiryPolicy",
  "maintenanceMode",
  "checkoutKillSwitch",
  "provisioningKillSwitch",
  "fx",
  "markup",
  "paymentExpiry",
  "providerThreshold",
  "notifications",
  "security",
];
export function validateAdminSetting(key: AdminSettingKey, value: unknown) {
  if (
    key === "retryPolicy" &&
    (!value ||
      typeof value !== "object" ||
      !Number.isInteger((value as { maxAttempts?: unknown }).maxAttempts) ||
      Number((value as { maxAttempts: number }).maxAttempts) < 1 ||
      Number((value as { maxAttempts: number }).maxAttempts) > 10)
  )
    throw new Error("retryPolicy.maxAttempts harus 1-10");
  if (
    ["maintenanceMode", "checkoutKillSwitch", "provisioningKillSwitch"].includes(key) &&
    typeof value !== "boolean"
  )
    throw new Error(`${key} harus boolean`);
  if (
    ["paymentExpiry", "providerThreshold"].includes(key) &&
    (!Number.isFinite(Number(value)) || Number(value) < 0)
  )
    throw new Error(`${key} harus angka non-negatif`);
  if (
    key === "markup" &&
    (!value ||
      typeof value !== "object" ||
      Number((value as { percent?: unknown }).percent) < 0 ||
      Number((value as { percent?: unknown }).percent) > 100)
  )
    throw new Error("markup.percent harus 0-100");
  return true;
}
export function buildSettingAudit(
  key: AdminSettingKey,
  before: unknown,
  after: unknown,
  actorId: string,
  reason: string,
) {
  if (!actorId.trim() || !reason.trim())
    throw new Error("Perubahan settings membutuhkan actor dan reason");
  validateAdminSetting(key, after);
  return {
    action: "settings.change",
    entityType: "admin_setting",
    entityId: key,
    beforeJson: before,
    afterJson: after,
    actorId,
    reason,
  };
}
