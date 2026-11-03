// Pure helpers for scripts/djiwa.mjs. No network, no git, no ssh: everything here is unit-tested in
// src/test/djiwa-cli.test.ts so the CLI's safety rules do not depend on being exercised by hand.

import { createHash } from "node:crypto";

/**
 * Statements the read-only DB commands refuse. The database also runs them inside
 * `BEGIN READ ONLY`, so this list is the first fence, not the only one.
 */
const FORBIDDEN_WORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "truncate",
  "grant",
  "revoke",
  "create",
  "copy",
  "call",
  "do",
  "vacuum",
  "reindex",
  "cluster",
  "lock",
  "refresh",
  "set",
  "reset",
  "commit",
  "rollback",
  "begin",
  "end",
  "savepoint",
  "release",
  "listen",
  "notify",
  "prepare",
  "execute",
  "comment",
  "security",
  "merge",
  "import",
];
const FORBIDDEN_FUNCTIONS = [
  "pg_terminate_backend",
  "pg_cancel_backend",
  "pg_read_file",
  "pg_read_binary_file",
  "pg_ls_dir",
  "lo_import",
  "lo_export",
  "dblink",
  "pg_reload_conf",
  "set_config",
  "nextval",
  "setval",
  "pg_advisory_lock",
  "pg_advisory_xact_lock",
];
const ALLOWED_FIRST_WORDS = new Set(["select", "with", "show", "explain", "table", "values"]);

/** Removes string literals, quoted identifiers and comments so keyword checks see only SQL text. */
export function stripSqlLiterals(sql) {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "-" && next === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      while (i < sql.length) {
        if (sql[i] === quote && sql[i + 1] === quote) i += 2;
        else if (sql[i] === quote) break;
        else i++;
      }
      i++;
      out += " ";
      continue;
    }
    if (ch === "$" && /\$[A-Za-z_]*\$/.test(sql.slice(i, i + 40))) {
      const tag = sql.slice(i).match(/^\$[A-Za-z_]*\$/)[0];
      const end = sql.indexOf(tag, i + tag.length);
      i = end === -1 ? sql.length : end + tag.length;
      out += " ";
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Throws unless `sql` is one read-only statement. Returns the cleaned statement (no trailing `;`).
 */
export function assertReadOnlySql(sql) {
  const text = String(sql ?? "")
    .trim()
    .replace(/;+\s*$/, "");
  if (!text) throw new Error("SQL kosong");
  const bare = stripSqlLiterals(text);
  if (bare.includes(";")) throw new Error("Hanya satu statement per perintah (tanda ; ditemukan)");
  const words = bare.toLowerCase().match(/[a-z_][a-z0-9_]*/g) ?? [];
  if (!ALLOWED_FIRST_WORDS.has(words[0] ?? "")) {
    throw new Error(
      `Hanya SELECT/WITH/SHOW/EXPLAIN/TABLE/VALUES yang diizinkan (mulai dengan "${words[0] ?? ""}")`,
    );
  }
  for (const word of words) {
    if (FORBIDDEN_WORDS.includes(word))
      throw new Error(`Kata kunci "${word}" tidak diizinkan di mode baca-saja`);
    if (FORBIDDEN_FUNCTIONS.includes(word))
      throw new Error(`Fungsi "${word}" tidak diizinkan di mode baca-saja`);
  }
  if (/\binto\b/i.test(bare) && /^\s*select/i.test(bare)) {
    throw new Error("SELECT ... INTO membuat tabel; tidak diizinkan");
  }
  return text;
}

/** `035_site_events.sql` ... -> "036". Ignores files that are not `NNN_*.sql`. */
export function nextMigrationNumber(files) {
  let max = 0;
  for (const file of files) {
    const match = /^(\d{3})_.+\.sql$/.exec(file);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return String(max + 1).padStart(3, "0");
}

export function slugify(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

/** TanStack file-route name for a URL path: "/admin/foo/$id" -> "admin.foo.$id.tsx", "/" -> "index.tsx". */
export function routeFileFor(urlPath) {
  const clean = String(urlPath ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  if (!clean) return "index.tsx";
  if (!/^[A-Za-z0-9_$./-]+$/.test(clean)) throw new Error(`Path route tidak valid: ${urlPath}`);
  return `${clean.split("/").join(".")}.tsx`;
}

/** Variable names declared in an env template (`NAME=` lines), never their values. */
export function parseEnvNames(text) {
  const names = [];
  for (const line of String(text ?? "").split("\n")) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line);
    if (match) names.push(match[1]);
  }
  return [...new Set(names)];
}

/** Every JS/CSS the HTML references, de-duplicated and sorted. */
export function extractAssets(html) {
  const found = String(html ?? "").match(/\/assets\/[A-Za-z0-9._/-]+\.(?:js|css)/g) ?? [];
  return [...new Set(found)].sort();
}

/** Short, non-reversible fingerprint used to compare secrets across hosts without printing them. */
export function fingerprint(value) {
  return createHash("sha256")
    .update(String(value ?? ""))
    .digest("hex")
    .slice(0, 12);
}

/** Minimal flag parser: `--key value`, `--flag`, `-m value`, everything else positional. */
export function parseArgs(argv, { booleans = [], aliases = {} } = {}) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (token.startsWith("--") || (token.startsWith("-") && token.length === 2)) {
      const raw = token.replace(/^-+/, "");
      const key = aliases[raw] ?? raw;
      if (booleans.includes(key)) flags[key] = true;
      else flags[key] = argv[++i];
    } else positional.push(token);
  }
  return { flags, positional };
}

/** Marks which of the changed paths are in `wanted` (a file or a directory prefix). */
export function selectPaths(changed, wanted) {
  if (!wanted || wanted.length === 0) return [...changed];
  const prefixes = wanted.map((entry) => entry.replace(/\/+$/, ""));
  return changed.filter((file) => prefixes.some((p) => file === p || file.startsWith(`${p}/`)));
}

/** True for `.`, `-A`-style "add everything" requests that `ship` refuses. */
export function isBroadPath(entry) {
  return (
    entry === "." || entry === "./" || entry === "*" || entry === ".." || entry.startsWith("-")
  );
}
