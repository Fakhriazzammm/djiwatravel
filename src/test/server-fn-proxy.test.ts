import { describe, expect, it } from "vitest";

import { executeServerFn } from "@/lib/server-fn-proxy";

describe("executeServerFn", () => {
  it("uses the server execution hook and returns its result", async () => {
    const calls: Array<{ method: string; data: unknown }> = [];
    const serverFn = {
      __executeServer: async (options: { method: "GET" | "POST"; data: unknown }) => {
        calls.push(options);
        return { result: { ok: true }, error: undefined };
      },
    };

    await expect(executeServerFn(serverFn, "POST", { id: "demo" })).resolves.toEqual({ ok: true });
    expect(calls).toEqual([{ method: "POST", data: { id: "demo" } }]);
  });

  it("surfaces server function errors", async () => {
    const error = new Error("server failure");
    const serverFn = {
      __executeServer: async () => ({ result: undefined, error }),
    };

    await expect(executeServerFn(serverFn, "GET")).rejects.toBe(error);
  });
});
