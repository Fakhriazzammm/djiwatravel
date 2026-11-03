import { describe, expect, it } from "vitest";
import {
  assertReadOnlySql,
  extractAssets,
  fingerprint,
  isBroadPath,
  nextMigrationNumber,
  parseArgs,
  parseEnvNames,
  routeFileFor,
  selectPaths,
  slugify,
} from "../../scripts/lib/djiwa-core.mjs";

describe("djiwa CLI: read-only SQL fence", () => {
  it("accepts plain reads and strips a trailing semicolon", () => {
    expect(assertReadOnlySql("select count(*) from customer_orders;")).toBe(
      "select count(*) from customer_orders",
    );
    expect(assertReadOnlySql("WITH a AS (SELECT 1) SELECT * FROM a")).toContain("WITH");
    expect(assertReadOnlySql("show server_version")).toBe("show server_version");
    expect(assertReadOnlySql("explain select 1")).toContain("explain");
  });

  it("ignores keywords that only appear inside literals, identifiers or comments", () => {
    expect(() =>
      assertReadOnlySql("select 'delete; drop table x' as note, \"update\" from t -- insert"),
    ).not.toThrow();
    expect(() => assertReadOnlySql("select created_at, updated_at from t")).not.toThrow();
  });

  it("refuses writes, DDL, locks and multi-statement input", () => {
    for (const sql of [
      "delete from customer_orders",
      "update customer_orders set status = 'x'",
      "insert into t values (1)",
      "drop table t",
      "select 1; select 2",
      "select * from t for update",
      "with x as (delete from t returning *) select * from x",
      "select pg_terminate_backend(1)",
      "select * into newtable from t",
      "select set_config('a','b',false)",
      "copy t to stdout",
      "",
    ]) {
      expect(() => assertReadOnlySql(sql), sql).toThrow();
    }
  });

  it("does not let a dollar-quoted string hide a second statement", () => {
    expect(() => assertReadOnlySql("select $$ok$$; drop table t")).toThrow();
  });
});

describe("djiwa CLI: scaffolding helpers", () => {
  it("numbers the next migration", () => {
    expect(nextMigrationNumber(["001_a.sql", "035_site_events.sql", "README.md"])).toBe("036");
    expect(nextMigrationNumber([])).toBe("001");
  });

  it("slugifies names", () => {
    expect(slugify("Add Refund Notes!")).toBe("add_refund_notes");
  });

  it("maps URL paths to TanStack route files", () => {
    expect(routeFileFor("/")).toBe("index.tsx");
    expect(routeFileFor("/wallet")).toBe("wallet.tsx");
    expect(routeFileFor("/admin/orders/$id")).toBe("admin.orders.$id.tsx");
    expect(() => routeFileFor("/bad path")).toThrow();
  });
});

describe("djiwa CLI: env and asset helpers", () => {
  it("reads variable names from a template without values", () => {
    const names = parseEnvNames("# c\nA_KEY=\nB_TOKEN=secret\n  C=1\nlower=x\n");
    expect(names).toEqual(["A_KEY", "B_TOKEN", "C"]);
  });

  it("lists referenced assets once", () => {
    const html =
      '<link href="/assets/a-1.css"><script src="/assets/index-X.js"></script><link href="/assets/a-1.css"><img src="/assets/x.png">';
    expect(extractAssets(html)).toEqual(["/assets/a-1.css", "/assets/index-X.js"]);
  });

  it("fingerprints equal secrets equally and never echoes them", () => {
    expect(fingerprint("s3cret")).toBe(fingerprint("s3cret"));
    expect(fingerprint("s3cret")).not.toContain("s3cret");
    expect(fingerprint("a")).not.toBe(fingerprint("b"));
  });
});

describe("djiwa CLI: argument and path handling", () => {
  it("parses flags, aliases and positionals", () => {
    const { flags, positional } = parseArgs(["-m", "msg", "--no-wait", "a.ts", "b.ts"], {
      booleans: ["no-wait"],
      aliases: { m: "message" },
    });
    expect(flags).toEqual({ message: "msg", "no-wait": true });
    expect(positional).toEqual(["a.ts", "b.ts"]);
  });

  it("selects only the requested changed paths", () => {
    const changed = ["src/a.ts", "src/lib/b.ts", "docs/x.md"];
    expect(selectPaths(changed, ["src/lib"])).toEqual(["src/lib/b.ts"]);
    expect(selectPaths(changed, ["src/a.ts", "docs/x.md"])).toEqual(["src/a.ts", "docs/x.md"]);
    expect(selectPaths(changed, [])).toEqual(changed);
  });

  it("flags add-everything requests", () => {
    for (const entry of [".", "./", "*", "-A", ".."]) expect(isBroadPath(entry)).toBe(true);
    expect(isBroadPath("src/a.ts")).toBe(false);
  });
});
