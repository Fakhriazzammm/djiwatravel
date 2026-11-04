import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { pool } from "@/db/client.server";

/**
 * The traveler's single Google connection, shared by Calendar, Drive and Sheets.
 *
 * Tokens live only in Postgres (`customer_google_calendar_connections`), AES-256-GCM encrypted with
 * GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY from the VPS environment. The browser only ever receives the
 * account e-mail, the enabled features and their status, never a token.
 */

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export const GOOGLE_SCOPES = {
  calendar: "https://www.googleapis.com/auth/calendar.events",
  /** Only files this app creates in the traveler's Drive (non-sensitive scope). */
  drive: "https://www.googleapis.com/auth/drive.file",
  email: "https://www.googleapis.com/auth/userinfo.email",
} as const;

export type GoogleFeature = "calendar" | "drive" | "sheets";
export const GOOGLE_FEATURES: readonly GoogleFeature[] = ["calendar", "drive", "sheets"];

/** Sheets are created through Drive, so `drive.file` covers both. */
const FEATURE_SCOPE: Record<GoogleFeature, string> = {
  calendar: GOOGLE_SCOPES.calendar,
  drive: GOOGLE_SCOPES.drive,
  sheets: GOOGLE_SCOPES.drive,
};

export function parseFeatures(value: string | null | undefined): GoogleFeature[] {
  const wanted = String(value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is GoogleFeature => (GOOGLE_FEATURES as readonly string[]).includes(part));
  return wanted.length ? [...new Set(wanted)] : ["calendar"];
}

export function scopesForFeatures(features: readonly GoogleFeature[]) {
  return [...new Set([GOOGLE_SCOPES.email, ...features.map((feature) => FEATURE_SCOPE[feature])])];
}

export function featuresFromScopes(scopes: readonly string[]) {
  const granted = new Set(scopes);
  return {
    calendar: granted.has(GOOGLE_SCOPES.calendar),
    drive: granted.has(GOOGLE_SCOPES.drive),
    sheets: granted.has(GOOGLE_SCOPES.drive),
  } satisfies Record<GoogleFeature, boolean>;
}

export type GoogleConnection = {
  customer_auth_subject: string;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  google_account_email: string | null;
  granted_scopes: string[] | null;
  drive_enabled: boolean | null;
  connected_at: string | null;
};

/** Google no longer honours the stored refresh token (revoked in the Google account, or expired). */
export class GoogleAccessRevokedError extends Error {
  constructor() {
    super("Akses Google dicabut atau kedaluwarsa");
    this.name = "GoogleAccessRevokedError";
  }
}

export function googleConfigured() {
  return Boolean(
    process.env["GOOGLE_CALENDAR_CLIENT_ID"] &&
    process.env["GOOGLE_CALENDAR_CLIENT_SECRET"] &&
    process.env["GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY"],
  );
}

export function config() {
  const clientId = process.env["GOOGLE_CALENDAR_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CALENDAR_CLIENT_SECRET"];
  const redirectUri =
    process.env["GOOGLE_CALENDAR_REDIRECT_URI"] ??
    "https://djiwatravel.com/api/google-calendar/callback";
  const keyText = process.env["GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY"];
  if (!clientId || !clientSecret || !keyText) throw new Error("Google belum dikonfigurasi");
  const key = /^[0-9a-f]{64}$/i.test(keyText)
    ? Buffer.from(keyText, "hex")
    : Buffer.from(keyText, "base64");
  if (key.length !== 32)
    throw new Error("GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY harus 32 byte (hex/base64)");
  return { clientId, clientSecret, redirectUri, key };
}

export function encrypt(value: string) {
  const { key } = config();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decrypt(value: string) {
  const { key } = config();
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted) throw new Error("Token Google rusak");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function stateHash(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export async function connectionFor(subject: string) {
  const result = await pool.query(
    "select * from customer_google_calendar_connections where customer_auth_subject=$1 limit 1",
    [subject],
  );
  return (result.rows[0] as GoogleConnection | undefined) ?? null;
}

export function grantedScopes(connection: GoogleConnection | null) {
  if (!connection?.refresh_token_encrypted) return [];
  return connection.granted_scopes ?? [];
}

export function hasFeature(connection: GoogleConnection | null, feature: GoogleFeature) {
  return featuresFromScopes(grantedScopes(connection))[feature];
}

export async function refreshAccessToken(connection: GoogleConnection) {
  if (!connection.refresh_token_encrypted) throw new GoogleAccessRevokedError();
  const { clientId, clientSecret } = config();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decrypt(connection.refresh_token_encrypted),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    if (detail?.error === "invalid_grant") throw new GoogleAccessRevokedError();
    throw new Error("Token Google tidak dapat diperbarui");
  }
  const payload = (await response.json()) as { access_token: string; expires_in?: number };
  await pool.query(
    "update customer_google_calendar_connections set access_token_encrypted=$1, token_expires_at=now()+($2 * interval '1 second'), updated_at=now() where customer_auth_subject=$3",
    [encrypt(payload.access_token), payload.expires_in ?? 3600, connection.customer_auth_subject],
  );
  return payload.access_token;
}

export async function accessToken(connection: GoogleConnection) {
  if (
    connection.access_token_encrypted &&
    connection.token_expires_at &&
    new Date(connection.token_expires_at).getTime() > Date.now() + 60_000
  )
    return decrypt(connection.access_token_encrypted);
  return refreshAccessToken(connection);
}

/** Starts the Google consent screen for the requested features, keeping scopes already granted. */
export async function startGoogleConnect(user: { id: string }, features: readonly GoogleFeature[]) {
  const { clientId, redirectUri } = config();
  const state = randomBytes(32).toString("base64url");
  await pool.query(
    `insert into customer_google_calendar_connections (customer_auth_subject,state_hash,state_expires_at)
     values ($1,$2,now()+interval '10 minutes')
     on conflict (customer_auth_subject) do update
       set state_hash=excluded.state_hash,state_expires_at=excluded.state_expires_at,updated_at=now()`,
    [user.id, stateHash(state)],
  );
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: scopesForFeatures(features).join(" "),
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/** Exchanges the code, stores the encrypted tokens and the scopes Google actually granted. */
export async function finishGoogleConnect(code: string, state: string) {
  const result = await pool.query(
    "select customer_auth_subject from customer_google_calendar_connections where state_hash=$1 and state_expires_at > now() limit 1",
    [stateHash(state)],
  );
  const pending = result.rows[0] as { customer_auth_subject: string } | undefined;
  if (!pending) throw new Error("Sesi koneksi Google kedaluwarsa");
  const { clientId, clientSecret, redirectUri } = config();
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) throw new Error("Google menolak koneksi");
  const token = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!token.refresh_token) throw new Error("Refresh token Google tidak diterima");
  const scopes = String(token.scope ?? "")
    .split(/\s+/)
    .filter(Boolean);
  let email: string | null = null;
  try {
    const info = await fetch(GOOGLE_USERINFO_URL, {
      headers: { authorization: `Bearer ${token.access_token}` },
    });
    if (info.ok) email = ((await info.json()) as { email?: string }).email ?? null;
  } catch {
    email = null;
  }
  await pool.query(
    `update customer_google_calendar_connections
        set access_token_encrypted=$1, refresh_token_encrypted=$2,
            token_expires_at=now()+($3 * interval '1 second'),
            granted_scopes=$4, google_account_email=coalesce($5, google_account_email),
            state_hash=null, state_expires_at=null,
            connected_at=coalesce(connected_at,now()), updated_at=now()
      where customer_auth_subject=$6`,
    [
      encrypt(token.access_token),
      encrypt(token.refresh_token),
      token.expires_in ?? 3600,
      scopes,
      email,
      pending.customer_auth_subject,
    ],
  );
  return { subject: pending.customer_auth_subject, features: featuresFromScopes(scopes) };
}

/** Status for the browser: no tokens, only what the UI needs. */
export async function googleAccountStatus(subject: string) {
  const connection = await connectionFor(subject);
  const connected = Boolean(connection?.refresh_token_encrypted);
  return {
    connected,
    accountEmail: connected ? (connection?.google_account_email ?? null) : null,
    connectedAt: connected ? (connection?.connected_at ?? null) : null,
    features: connected
      ? { ...featuresFromScopes(grantedScopes(connection)) }
      : { calendar: false, drive: false, sheets: false },
    driveEnabled: connected && connection?.drive_enabled !== false,
  };
}

export async function setDriveEnabled(subject: string, enabled: boolean) {
  await pool.query(
    "update customer_google_calendar_connections set drive_enabled=$1, updated_at=now() where customer_auth_subject=$2",
    [enabled, subject],
  );
}

/**
 * Disconnects Google: revokes the grant at Google (best effort), marks the Drive/Sheets work that
 * can no longer run as `revoked`, and deletes the stored tokens. Files already in the traveler's
 * Drive and Sheets are never touched.
 */
export async function disconnectGoogle(subject: string) {
  const connection = await connectionFor(subject);
  if (connection?.refresh_token_encrypted) {
    try {
      await fetch(GOOGLE_REVOKE_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: decrypt(connection.refresh_token_encrypted) }),
      });
    } catch (error) {
      console.error("[google] revoke failed", {
        error: error instanceof Error ? error.message : error,
      });
    }
  }
  await markGoogleWorkRevoked(subject);
  await pool.query(
    "delete from customer_google_calendar_connections where customer_auth_subject=$1",
    [subject],
  );
}

export async function markGoogleWorkRevoked(subject: string) {
  await pool.query(
    "update travel_google_drive_files set status='revoked', updated_at=now() where customer_auth_subject=$1 and status in ('pending','failed')",
    [subject],
  );
  await pool.query(
    "update travel_google_sheet_exports set status='revoked', updated_at=now() where customer_auth_subject=$1 and status in ('pending','failed')",
    [subject],
  );
}

export function redactError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return text
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[redacted]")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .slice(0, 240);
}

/** Fetch against a Google API with the user's token; refreshes once on 401. */
export async function googleFetch(
  subject: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const connection = await connectionFor(subject);
  if (!connection?.refresh_token_encrypted) throw new GoogleAccessRevokedError();
  let token = await accessToken(connection);
  const run = (bearer: string) =>
    fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), authorization: `Bearer ${bearer}` },
    });
  let response = await run(token);
  if (response.status === 401) {
    token = await refreshAccessToken(connection);
    response = await run(token);
  }
  return response;
}
