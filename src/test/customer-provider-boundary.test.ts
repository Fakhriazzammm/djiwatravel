// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("customer provider boundary", () => {
  it("keeps catalog, finder, checkout and order dependencies independent of AI/MCP", () => {
    const root = path.resolve("src");
    const pending = [
      "routes/catalog.tsx",
      "routes/finder.tsx",
      "routes/checkout.$id.tsx",
      "lib/guest-orders.server.ts",
      "lib/esim-access-provisioner.ts",
    ].map((file) => path.join(root, file));
    const seen = new Set<string>();
    while (pending.length) {
      const file = pending.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      expect(file).not.toMatch(/\/ai\/|mcp|recommendation-explanation/);
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(
        /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g,
      )) {
        const specifier = match[1]!;
        const target = specifier.startsWith("@/")
          ? path.join(root, specifier.slice(2))
          : specifier.startsWith(".")
            ? path.resolve(path.dirname(file), specifier)
            : undefined;
        if (!target) continue;
        const resolved = [
          target,
          `${target}.ts`,
          `${target}.tsx`,
          path.join(target, "index.ts"),
        ].find((candidate) => existsSync(candidate));
        if (resolved && /\.tsx?$/.test(resolved)) pending.push(resolved);
      }
    }
    expect(seen.has(path.join(root, "lib/esim-access.ts"))).toBe(true);
  });
});
