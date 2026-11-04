import { useCallback, useEffect, useState } from "react";

/** What the browser knows about the traveler's Google connection. Never contains a token. */
export type GoogleStatus = {
  configured: boolean;
  googleConnected: boolean;
  accountEmail: string | null;
  features: { calendar: boolean; drive: boolean; sheets: boolean };
  driveEnabled: boolean;
  drive: { pending: number; uploaded: number; failed: number; revoked: number };
  sheets: { pending: number; failed: number; revoked: number };
  needsReconnect: boolean;
};

export const EMPTY_GOOGLE_STATUS: GoogleStatus = {
  configured: true,
  googleConnected: false,
  accountEmail: null,
  features: { calendar: false, drive: false, sheets: false },
  driveEnabled: false,
  drive: { pending: 0, uploaded: 0, failed: 0, revoked: 0 },
  sheets: { pending: 0, failed: 0, revoked: 0 },
  needsReconnect: false,
};

const count = (value: unknown) => Math.max(0, Number(value) || 0);

export function parseGoogleStatus(raw: unknown): GoogleStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const features = (r["features"] ?? {}) as Record<string, unknown>;
  const drive = (r["drive"] ?? {}) as Record<string, unknown>;
  const sheets = (r["sheets"] ?? {}) as Record<string, unknown>;
  return {
    configured: r["configured"] !== false,
    googleConnected: Boolean(r["googleConnected"] ?? r["connected"]),
    accountEmail: typeof r["accountEmail"] === "string" ? r["accountEmail"] : null,
    features: {
      calendar: Boolean(features["calendar"] ?? r["connected"]),
      drive: Boolean(features["drive"]),
      sheets: Boolean(features["sheets"]),
    },
    driveEnabled: Boolean(r["driveEnabled"]),
    drive: {
      pending: count(drive["pending"]),
      uploaded: count(drive["uploaded"]),
      failed: count(drive["failed"]),
      revoked: count(drive["revoked"]),
    },
    sheets: {
      pending: count(sheets["pending"]),
      failed: count(sheets["failed"]),
      revoked: count(sheets["revoked"]),
    },
    needsReconnect: Boolean(r["needsReconnect"]),
  };
}

/** Drive receipt photos are being saved to the traveler's Drive. */
export const driveIsOn = (status: GoogleStatus) => status.features.drive && status.driveEnabled;

export function googleConnectHref(features: string, returnTo?: string) {
  const query = new URLSearchParams({ features });
  if (returnTo) query.set("returnTo", returnTo);
  return `/api/google-calendar/connect?${query.toString()}`;
}

export function useGoogleStatus(enabled = true) {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [error, setError] = useState(false);
  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/google-calendar/status", { credentials: "include" });
      if (!response.ok) throw new Error("status");
      setStatus(parseGoogleStatus(await response.json()));
      setError(false);
    } catch {
      setError(true);
    }
  }, []);
  useEffect(() => {
    if (enabled) void reload();
  }, [enabled, reload]);
  return { status, error, reload };
}
