/**
 * Admin-controlled Generative Engine Optimization (GEO) policy.
 *
 * One record (`admin_settings.aiSearch`) drives `/robots.txt` and `/llms.txt`. Defaults keep the
 * storefront discoverable by AI answer engines; Admin can switch it off without a deploy.
 */
export type GeoConfig = {
  /** Allows AI search/answer crawlers (OAI-SearchBot, PerplexityBot, Claude-SearchBot…) and serves llms.txt. */
  aiSearchEnabled: boolean;
  /** Allows model-training crawlers (GPTBot, ClaudeBot, Google-Extended, CCBot…). */
  aiTrainingEnabled: boolean;
};

export const DEFAULT_GEO_CONFIG: GeoConfig = { aiSearchEnabled: true, aiTrainingEnabled: true };

export function parseGeoConfig(value: unknown): GeoConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("aiSearch harus berupa objek");
  }
  const v = value as { aiSearchEnabled?: unknown; aiTrainingEnabled?: unknown };
  for (const key of ["aiSearchEnabled", "aiTrainingEnabled"] as const) {
    if (v[key] !== undefined && typeof v[key] !== "boolean")
      throw new Error(`${key} harus boolean`);
  }
  return {
    aiSearchEnabled: v.aiSearchEnabled === undefined ? true : (v.aiSearchEnabled as boolean),
    aiTrainingEnabled: v.aiTrainingEnabled === undefined ? true : (v.aiTrainingEnabled as boolean),
  };
}

export function normalizeGeoConfig(value: unknown): GeoConfig {
  try {
    return parseGeoConfig(value);
  } catch {
    return DEFAULT_GEO_CONFIG;
  }
}
