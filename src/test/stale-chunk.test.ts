import { describe, expect, it, vi } from "vitest";
import { isStaleChunkError, reloadOnceForStaleChunk } from "@/lib/stale-chunk";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

describe("stale chunk recovery", () => {
  it("recognises failed dynamic imports from browsers", () => {
    expect(
      isStaleChunkError(
        new TypeError("Failed to fetch dynamically imported module: https://x/a.js"),
      ),
    ).toBe(true);
    expect(isStaleChunkError(new TypeError("error loading dynamically imported module"))).toBe(
      true,
    );
    expect(isStaleChunkError(new Error("Database is down"))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });

  it("reloads once per session and never loops", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const error = new TypeError("Failed to fetch dynamically imported module: /assets/a.js");
    expect(reloadOnceForStaleChunk(error, storage, reload)).toBe(true);
    expect(reloadOnceForStaleChunk(error, storage, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload for ordinary errors", () => {
    const reload = vi.fn();
    expect(reloadOnceForStaleChunk(new Error("boom"), memoryStorage(), reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
