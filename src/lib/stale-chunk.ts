/**
 * A tab opened before a deploy keeps the old route manifest, so lazy-loading a chunk that the new
 * build replaced fails with one of these browser messages. Reloading once fetches the new build.
 */
const STALE_CHUNK_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
];

const RELOAD_KEY = "djiwa.stale-chunk-reload";

export function isStaleChunkError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "";
  return STALE_CHUNK_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Reloads at most once per session so a genuinely broken chunk cannot loop forever.
 * Returns true when a reload was triggered.
 */
export function reloadOnceForStaleChunk(
  error: unknown,
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  reload: () => void,
): boolean {
  if (!isStaleChunkError(error)) return false;
  try {
    if (storage?.getItem(RELOAD_KEY)) return false;
    storage?.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  reload();
  return true;
}
