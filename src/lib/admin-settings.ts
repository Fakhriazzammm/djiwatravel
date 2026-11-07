import { parseFlightsConfig } from "./flights";
import { parseEsimSharingConfig } from "./esim-share";
import { parseGeoConfig } from "./geo-config";
import { parseGuestTripsConfig } from "./guest-trips";
import { parseHomeEsimConfig } from "./home-esim-config";
import { parseItineraryMapConfig } from "./itinerary-map";
import { parseReceiptScanConfig } from "./receipt-scan";
import { parsePlaceIdeasConfig } from "./place-ideas";
import { parsePwaConfig } from "./pwa-config";

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
  | "security"
  | "homeEsim"
  | "aiSearch"
  | "pwa"
  | "esimSharing"
  | "itineraryMap"
  | "receiptScan"
  | "placeIdeas"
  | "guestTrips"
  | "flights";
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
  "homeEsim",
  "aiSearch",
  "pwa",
  "esimSharing",
  "itineraryMap",
  "receiptScan",
  "placeIdeas",
  "guestTrips",
  "flights",
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
  if (key === "homeEsim") parseHomeEsimConfig(value);
  if (key === "aiSearch") parseGeoConfig(value);
  if (key === "pwa") parsePwaConfig(value);
  if (key === "esimSharing") parseEsimSharingConfig(value);
  if (key === "itineraryMap") parseItineraryMapConfig(value);
  if (key === "receiptScan") parseReceiptScanConfig(value);
  if (key === "placeIdeas") parsePlaceIdeasConfig(value);
  if (key === "guestTrips") parseGuestTripsConfig(value);
  if (key === "flights") parseFlightsConfig(value);
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
