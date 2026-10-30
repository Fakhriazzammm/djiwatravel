/** Non-sensitive provider usage data, expressed in bytes. */
export type EsimStoredUsage = {
  totalBytes?: number;
  usedBytes: number;
  measuredAtMs?: number;
};

type UsageRow = {
  totalBytes: unknown;
  usedBytes: unknown;
  remainingBytes: unknown;
  measuredAt: unknown;
};

function nonnegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) {
    return null;
  }
  const number =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** Normalize database numeric strings without interpreting missing values as zero. */
export function normalizeStoredUsage(row: UsageRow): EsimStoredUsage | null {
  const rawTotal = nonnegativeNumber(row.totalBytes);
  const total = rawTotal !== null && rawTotal > 0 ? rawTotal : null;
  const remaining = nonnegativeNumber(row.remainingBytes);
  let used = nonnegativeNumber(row.usedBytes);
  if (used === null && total !== null && remaining !== null && remaining <= total) {
    used = total - remaining;
  }
  if (used === null) return null;

  const parsedTime =
    row.measuredAt instanceof Date
      ? row.measuredAt.getTime()
      : typeof row.measuredAt === "string"
        ? Date.parse(row.measuredAt)
        : NaN;
  return {
    ...(total === null ? {} : { totalBytes: total }),
    usedBytes: used,
    ...(Number.isFinite(parsedTime) ? { measuredAtMs: parsedTime } : {}),
  };
}

/** Never attach a snapshot for a provider order outside the already-authorized result set. */
export function selectAuthorizedUsage(
  authorizedOrderNos: readonly string[],
  rows: ReadonlyArray<{ providerOrderNo: string; usage: EsimStoredUsage }>,
): Map<string, EsimStoredUsage> {
  const authorized = new Set(authorizedOrderNos.filter(Boolean));
  return new Map(
    rows
      .filter(({ providerOrderNo }) => authorized.has(providerOrderNo))
      .map(({ providerOrderNo, usage }) => [providerOrderNo, usage]),
  );
}
