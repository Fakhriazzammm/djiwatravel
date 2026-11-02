/**
 * Admin-controlled PWA policy (`admin_settings.pwa`). Defaults keep the app installable, so with no
 * record the customer experience equals the shipped behaviour. Parsers live here (plain module) so
 * the browser and the server share them.
 */
export type PwaConfig = {
  installPromptEnabled: boolean;
  promptTitle: string;
  promptBody: string;
  /** Days before a dismissed install card may show again. */
  snoozeDays: number;
  /** Kill switch: false makes every client purge the service-worker caches and stop caching. */
  offlineCacheEnabled: boolean;
  pushEnabled: boolean;
};

export const DEFAULT_PWA_CONFIG: PwaConfig = {
  installPromptEnabled: true,
  promptTitle: "Pasang Djiwa Travel",
  promptBody: "Buka eSIM lebih cepat dari layar utama, bahkan saat sinyal lemah.",
  snoozeDays: 14,
  offlineCacheEnabled: true,
  pushEnabled: true,
};

export function parsePwaConfig(value: unknown): PwaConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("pwa harus berupa objek");
  }
  const v = value as Record<string, unknown>;
  for (const key of ["installPromptEnabled", "offlineCacheEnabled", "pushEnabled"] as const) {
    if (v[key] !== undefined && typeof v[key] !== "boolean")
      throw new Error(`${key} harus boolean`);
  }
  for (const [key, max] of [
    ["promptTitle", 60],
    ["promptBody", 160],
  ] as const) {
    if (v[key] !== undefined && (typeof v[key] !== "string" || !(v[key] as string).trim()))
      throw new Error(`${key} harus teks`);
    if (typeof v[key] === "string" && (v[key] as string).trim().length > max)
      throw new Error(`${key} maksimal ${max} karakter`);
  }
  if (
    v["snoozeDays"] !== undefined &&
    (!Number.isInteger(v["snoozeDays"]) ||
      (v["snoozeDays"] as number) < 1 ||
      (v["snoozeDays"] as number) > 90)
  )
    throw new Error("snoozeDays harus 1-90");
  const d = DEFAULT_PWA_CONFIG;
  return {
    installPromptEnabled:
      (v["installPromptEnabled"] as boolean | undefined) ?? d.installPromptEnabled,
    promptTitle: ((v["promptTitle"] as string | undefined) ?? d.promptTitle).trim(),
    promptBody: ((v["promptBody"] as string | undefined) ?? d.promptBody).trim(),
    snoozeDays: (v["snoozeDays"] as number | undefined) ?? d.snoozeDays,
    offlineCacheEnabled: (v["offlineCacheEnabled"] as boolean | undefined) ?? d.offlineCacheEnabled,
    pushEnabled: (v["pushEnabled"] as boolean | undefined) ?? d.pushEnabled,
  };
}

export function normalizePwaConfig(value: unknown): PwaConfig {
  try {
    return parsePwaConfig(value);
  } catch {
    return DEFAULT_PWA_CONFIG;
  }
}

export const PWA_EVENT_NAMES = [
  "install_prompt_shown",
  "install_accepted",
  "install_dismissed",
  "app_installed",
  "ios_guide_opened",
  "push_enabled",
  "sw_update_applied",
  "offline_page_shown",
] as const;
export type PwaEventName = (typeof PWA_EVENT_NAMES)[number];
export const PWA_PLATFORMS = ["android", "ios", "desktop", "other"] as const;
export type PwaPlatform = (typeof PWA_PLATFORMS)[number];

export type PwaStats = {
  days: number;
  counts: Record<PwaEventName, number>;
  standaloneOpens: number;
  activePushSubscriptions: number;
  pushSent: number;
  pushFailed: number;
  pushConfigured: boolean;
};
