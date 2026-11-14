/**
 * Public eSIM share links. Pure helpers shared by the browser and the server: the Admin switch
 * (`admin_settings.esimSharing`), who may share, and what a link is allowed to reveal.
 */
export const ESIM_SHARING_SETTING_KEY = "esimSharing";

export type EsimSharingConfig = {
  /** Kill switch: false stops new links and makes every existing link answer "unavailable". */
  enabled: boolean;
};

export const DEFAULT_ESIM_SHARING_CONFIG: EsimSharingConfig = { enabled: true };

export function parseEsimSharingConfig(value: unknown): EsimSharingConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("esimSharing harus berupa objek");
  }
  const enabled = (value as Record<string, unknown>)["enabled"];
  if (enabled !== undefined && typeof enabled !== "boolean") {
    throw new Error("esimSharing.enabled harus boolean");
  }
  return { enabled: enabled ?? DEFAULT_ESIM_SHARING_CONFIG.enabled };
}

/** Read path: a bad stored value falls back to the default instead of breaking a page. */
export function normalizeEsimSharingConfig(value: unknown): EsimSharingConfig {
  try {
    return parseEsimSharingConfig(value);
  } catch {
    return DEFAULT_ESIM_SHARING_CONFIG;
  }
}

/** Statuses whose QR may be handed to someone else. Everything else has nothing to give. */
const SHAREABLE_STATUSES = new Set(["READY", "INSTALLED"]);

/** Provider profile states that mean the package itself is over, not merely unclaimed. */
const ENDED_PROFILE_STATUSES = new Set(["USED_UP", "EXPIRED", "DISABLED", "DELETED"]);

export type ShareEligibility = "ok" | "not_ready" | "ended";

/**
 * A link is only as alive as the eSIM behind it, so there is no separate expiry: it follows the
 * package. Refunded, cancelled, failed, exhausted and expired orders end every link at read time.
 */
export function shareEligibility(input: {
  status: string;
  profileStatus?: string | null;
  expiresAtMs: number | null;
  hasProfile: boolean;
  now?: number;
}): ShareEligibility {
  const now = input.now ?? Date.now();
  if (["EXPIRED", "REFUNDED", "CANCELLED", "PROVISIONING_FAILED"].includes(input.status))
    return "ended";
  if (ENDED_PROFILE_STATUSES.has((input.profileStatus ?? "").toUpperCase())) return "ended";
  if (!SHAREABLE_STATUSES.has(input.status) || !input.hasProfile) return "not_ready";
  if (input.expiresAtMs !== null && input.expiresAtMs <= now) return "ended";
  return "ok";
}

export type ShareLinkSummary = {
  token: string;
  createdAt: string;
  claimed: boolean;
  claimedAt: string | null;
  viewCount: number;
  lastOpenedAt: string | null;
};

/** What the owner's sheet needs. `link` is null when no active link exists. */
export type OwnerShareState = {
  enabled: boolean;
  eligible: boolean;
  link: ShareLinkSummary | null;
};

/** Everything the recipient's page may show. No owner, order code, price or payment data. */
export type SharedEsimView = {
  packageName: string;
  locationCodes: string[];
  durationDays: number;
  quotaBytes: number | null;
  unlimited: boolean;
  expiresAtMs: number | null;
  installed: boolean;
  usage: {
    totalBytes: number | null;
    usedBytes: number;
    remainingBytes: number | null;
    measuredAt: number | null;
  } | null;
  esim: { lpa: string; smdp: string; activationCode: string };
  /** Whether access is stored on the recipient account or remains on a legacy browser cookie. */
  claimMode: "account" | "browser";
};

/** Admin read model: same lifecycle signals as the owner sheet, without the bearer token. */
export type AdminEsimShareState = {
  enabled: boolean;
  eligible: boolean;
  link: Omit<ShareLinkSummary, "token"> | null;
};

/** The page state for `/e/$token`. Invalid, revoked and ended links all look alike on purpose. */
export type SharedEsimLanding =
  | { state: "unavailable" }
  | { state: "claimed_elsewhere" }
  | { state: "claim_check_failed" }
  | {
      state: "available";
      preview: Pick<
        SharedEsimView,
        "packageName" | "locationCodes" | "durationDays" | "quotaBytes" | "unlimited"
      >;
    }
  | { state: "open"; view: SharedEsimView };

export const SHARE_TOKEN_MIN = 20;
export const SHARE_TOKEN_MAX = 128;
export const SHARE_PATH_PREFIX = "/e/";

export function shareUrl(origin: string, token: string): string {
  return `${origin}${SHARE_PATH_PREFIX}${token}`;
}

export function shareMessage(packageName: string, url: string): string {
  return `Aku kirim eSIM ${packageName} untukmu. Klaim dengan akun Djiwa Travel agar link yang sama bisa dibuka lagi dari browser lain dengan akun yang sama. Buka di HP yang akan memakai eSIM dan pasang dengan Wi-Fi:\n${url}`;
}
