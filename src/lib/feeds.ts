/**
 * Feeds antar traveler (Explore): pure rules shared by the customer screens, the server and Admin.
 * Nothing here touches the network or the database.
 */

export const FEEDS_SETTING_KEY = "feeds";

export const FEED_KINDS = ["cerita", "tips", "tanya", "titip"] as const;
export type FeedKind = (typeof FEED_KINDS)[number];
export const FEED_KIND_LABEL: Record<FeedKind, string> = {
  cerita: "Cerita",
  tips: "Tips",
  tanya: "Tanya",
  titip: "Titip Belanja",
};

export const GUIDE_AUTHOR_NAME = "Travo Guide";
export const GUIDE_AUTHOR_SUBJECT = "system:travo-guide";

export const FEED_BODY_MAX = 500;
export const FEED_COMMENT_MAX = 300;
export const FEED_PLACE_MAX = 80;
export const FEED_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export const FEED_REPORT_REASONS = ["spam", "salah", "pribadi", "kasar", "lainnya"] as const;
export type FeedReportReason = (typeof FEED_REPORT_REASONS)[number];
export const FEED_REPORT_LABEL: Record<FeedReportReason, string> = {
  spam: "Spam atau iklan",
  salah: "Informasi salah atau menyesatkan",
  pribadi: "Berisi data pribadi",
  kasar: "Kasar atau melecehkan",
  lainnya: "Lainnya",
};

export const FEED_STATUSES = ["PENDING", "PUBLISHED", "HIDDEN", "REMOVED"] as const;
export type FeedStatus = (typeof FEED_STATUSES)[number];
export const FEED_STATUS_LABEL: Record<FeedStatus, string> = {
  PENDING: "Menunggu tinjauan",
  PUBLISHED: "Tayang",
  HIDDEN: "Disembunyikan",
  REMOVED: "Dihapus",
};

export type FeedsConfig = {
  /** Master switch. Ships off; Explore hides the whole section when off. */
  enabled: boolean;
  allowPhotos: boolean;
  allowComments: boolean;
  /** The first N posts of an account wait for the team before they show. 0 = publish at once. */
  reviewFirstPosts: number;
  postsPerDay: number;
  commentsPerDay: number;
  /** A published post is hidden automatically once this many different members report it. */
  reportHideThreshold: number;
  /** Posts or comments containing one of these words are held (posts) or refused (comments). */
  bannedWords: string[];
};

export const DEFAULT_FEEDS_CONFIG: FeedsConfig = {
  enabled: false,
  allowPhotos: true,
  allowComments: true,
  reviewFirstPosts: 3,
  postsPerDay: 5,
  commentsPerDay: 30,
  reportHideThreshold: 3,
  bannedWords: [],
};

const bool = (value: unknown, label: string) => {
  if (typeof value !== "boolean") throw new Error(`feeds.${label} harus boolean`);
  return value;
};
const intIn = (value: unknown, min: number, max: number, label: string) => {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
    throw new Error(`feeds.${label} harus bilangan bulat ${min}-${max}`);
  return value as number;
};

/** Strict parse used when Admin saves: throws a readable error on anything invalid. */
export function parseFeedsConfig(value: unknown): FeedsConfig {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("feeds harus berupa objek");
  const raw = value as Record<string, unknown>;
  const d = DEFAULT_FEEDS_CONFIG;
  let bannedWords = d.bannedWords;
  if (raw["bannedWords"] !== undefined) {
    if (!Array.isArray(raw["bannedWords"]) || raw["bannedWords"].length > 60)
      throw new Error("feeds.bannedWords harus daftar berisi maksimal 60 kata");
    bannedWords = raw["bannedWords"].map((item) => {
      const word = typeof item === "string" ? item.trim().toLowerCase() : "";
      if (word.length < 2 || word.length > 40)
        throw new Error("feeds.bannedWords: tiap kata 2-40 karakter");
      return word;
    });
    bannedWords = [...new Set(bannedWords)];
  }
  return {
    enabled: raw["enabled"] === undefined ? d.enabled : bool(raw["enabled"], "enabled"),
    allowPhotos:
      raw["allowPhotos"] === undefined ? d.allowPhotos : bool(raw["allowPhotos"], "allowPhotos"),
    allowComments:
      raw["allowComments"] === undefined
        ? d.allowComments
        : bool(raw["allowComments"], "allowComments"),
    reviewFirstPosts:
      raw["reviewFirstPosts"] === undefined
        ? d.reviewFirstPosts
        : intIn(raw["reviewFirstPosts"], 0, 20, "reviewFirstPosts"),
    postsPerDay:
      raw["postsPerDay"] === undefined
        ? d.postsPerDay
        : intIn(raw["postsPerDay"], 1, 50, "postsPerDay"),
    commentsPerDay:
      raw["commentsPerDay"] === undefined
        ? d.commentsPerDay
        : intIn(raw["commentsPerDay"], 1, 200, "commentsPerDay"),
    reportHideThreshold:
      raw["reportHideThreshold"] === undefined
        ? d.reportHideThreshold
        : intIn(raw["reportHideThreshold"], 1, 20, "reportHideThreshold"),
    bannedWords,
  };
}

/** Lenient read for the screens: a broken stored value falls back to the defaults (feature off). */
export function normalizeFeedsConfig(value: unknown): FeedsConfig {
  try {
    return parseFeedsConfig(value);
  } catch {
    return DEFAULT_FEEDS_CONFIG;
  }
}

/** First word of the profile name, capitalised; never an e-mail address or a full name. */
export function feedAuthorName(displayName: string | null | undefined): string {
  const first = (displayName ?? "").trim().split(/\s+/)[0] ?? "";
  const clean = first.replace(/[^\p{L}\p{N}'-]/gu, "").slice(0, 20);
  if (!clean) return "Traveler";
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/** What the composer suggests: a question mark means Tanya, a named place means Tips. */
export function inferFeedKind(body: string, placeName: string): FeedKind {
  if (/\?\s*$/.test(body.trim())) return "tanya";
  if (placeName.trim()) return "tips";
  return "cerita";
}

export const isFeedKind = (value: unknown): value is FeedKind =>
  typeof value === "string" && (FEED_KINDS as readonly string[]).includes(value);

const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");

/** The first banned word found as a whole word or phrase, or null. */
export function findBannedWord(text: string, words: readonly string[]): string | null {
  if (!words.length) return null;
  const haystack = ` ${fold(text)} `;
  for (const word of words) {
    const needle = fold(word).trim();
    if (needle && haystack.includes(` ${needle} `)) return word;
  }
  return null;
}

/** "baru saja", "5 menit lalu", "2 jam lalu", "Kemarin", "3 hari lalu", then a short date. */
export function feedRelativeTime(iso: string, now = Date.now()): string {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "";
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 60) return "Baru saja";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Kemarin";
  if (days < 7) return `${days} hari lalu`;
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(new Date(at));
}

/** Photo magic bytes (JPEG, PNG, WebP) and size cap; null when not an accepted image. */
export function feedPhotoMime(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length < 12 || bytes.length > FEED_PHOTO_MAX_BYTES) return null;
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)) return "image/png";
  const head = new TextDecoder().decode(bytes.slice(0, 12));
  return head.startsWith("RIFF") && head.endsWith("WEBP") ? "image/webp" : null;
}

export type FeedPostView = {
  id: string;
  authorName: string;
  mine: boolean;
  kind: FeedKind;
  body: string;
  destinationCode: string | null;
  placeName: string | null;
  photoUrl: string | null;
  /** "guide" posts come from Travo Guide and carry a link card; "seed" posts are example content. */
  source: "member" | "seed" | "guide";
  linkPath: string | null;
  linkLabel: string | null;
  /** The comment previewed under the post: most liked, else newest. */
  topComment: { authorName: string; body: string; likeCount: number } | null;
  status: FeedStatus;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  bookmarked: boolean;
  createdAt: string;
  publishedAt: string | null;
};

export type FeedCommentView = {
  id: string;
  authorName: string;
  mine: boolean;
  body: string;
  likeCount: number;
  liked: boolean;
  createdAt: string;
};

/** One line in "Aktivitas": a comment on or a decision about the member's own post. */
export type FeedActivityItem = {
  id: string;
  type: "feed_comment" | "feed_post";
  title: string;
  body: string;
  href: string | null;
  at: string;
  unread: boolean;
};

/** Customer-safe status the Explore section and the composer read. */
export type FeedsStatus = {
  enabled: boolean;
  allowPhotos: boolean;
  allowComments: boolean;
  /** The first posts of an account wait for the team; the composer says so. */
  reviewsNewPosts: boolean;
  signedIn: boolean;
  banned: boolean;
  /** The member agreed to "Komunitas" (needed to post and comment). */
  communityConsent: boolean;
};

export const FEEDS_DISABLED_STATUS: FeedsStatus = {
  enabled: false,
  allowPhotos: false,
  allowComments: false,
  reviewsNewPosts: false,
  signedIn: false,
  banned: false,
  communityConsent: false,
};
