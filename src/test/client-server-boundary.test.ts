import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function clientReachableSources() {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const routeAndComponentSources = walk(sourceRoot)
    .filter((file) => file.includes(`${path.sep}routes${path.sep}`) || file.includes(`${path.sep}components${path.sep}`))
    .filter((file) => file.endsWith(".tsx"))
    .filter((file) => !file.includes(`${path.sep}routes${path.sep}api.`));
  const clientLibraries = [
    path.join(sourceRoot, "lib/orders.ts"),
    path.join(sourceRoot, "lib/admin-guard.ts"),
    path.join(sourceRoot, "lib/explore-warm.ts"),
    path.join(sourceRoot, "lib/sellability-api.ts"),
    ...walk(path.join(sourceRoot, "lib")).filter((file) => file.endsWith(".fn.ts")),
  ];
  return [...routeAndComponentSources, ...clientLibraries].filter((file) => statSync(file).isFile());
}

describe("client/server module boundary", () => {
  it("does not runtime-import server-only modules from client-reachable sources", () => {
    const violations = clientReachableSources().flatMap((file) => {
      const source = readFileSync(file, "utf8").replace(
        /(?:import|export)\s+type\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?/g,
        "",
      );
      return [...source.matchAll(/^(?!import type).*from\s+["'][^"']+\.server["']/gm)].map(
        (match) => `${path.relative(process.cwd(), file)}:${match[0].trim()}`,
      );
    });

    expect(violations).toEqual([]);
  });
});
