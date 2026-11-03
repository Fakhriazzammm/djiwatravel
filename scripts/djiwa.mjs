#!/usr/bin/env node
// Djiwa developer CLI: one entrypoint for working across Djiwa Travel and Djiwa Tentram/Pay.
//
//   node scripts/djiwa.mjs <command>        (or: scripts/djiwa <command>, npm run djiwa -- <command>)
//
// Zero dependencies. Secrets are never printed: env checks compare fingerprints, DB access is
// read-only, and `ship` only commits files you name. See docs/DEV-WORKFLOW.md.

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
} from "./lib/djiwa-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------------------------
// Topology: the single place that says what lives where. Keep in sync with PROJECT.md.
// ---------------------------------------------------------------------------------------------
const TRAVEL = {
  name: "Travel VPS",
  ssh: process.env["DJIWA_TRAVEL_SSH"] || "vps-djiwa-travel",
  dir: "/home/ubuntu/djiwatravel",
  service: "djiwatravel",
  url: process.env["DJIWA_TRAVEL_URL"] || "https://djiwatravel.com",
  envFile: "/etc/djiwatravel.env",
  taskEnvFile: "/etc/djiwatravel-task.env",
  db: "djiwatravel (Postgres lokal, peer auth)",
};
const TENTRAM = {
  name: "Tentram VPS",
  ssh: process.env["DJIWA_TENTRAM_SSH"] || "vps-djiwa-tentram",
  dir: "/opt/djiwatentramapp",
  repo: process.env["DJIWA_TENTRAM_REPO"] || join(homedir(), "djiwatentramapp"),
  authService: "better-auth",
  authDir: "/opt/djiwatentramapp/apps/auth-server",
  authEnvFile: "/etc/djiwatentramapp/better-auth.env",
  selfhost: "/opt/supabase-selfhost",
  functionsDir: "/opt/supabase-selfhost/volumes/functions",
  payDist: "/opt/djiwatentramapp/apps/djiwapay/dist",
  urls: {
    auth: "https://api.djiwatentram.web.id",
    functions: "https://supabase.djiwatentram.web.id/functions/v1",
    pay: "https://djiwapay.web.id",
  },
};
const COAUTHOR = process.env["DJIWA_COMMIT_TRAILER"] || "";

const TOPOLOGY = `
DJIWA TRAVEL  — ${TRAVEL.ssh}  (${TRAVEL.url})
  app        TanStack Start + Nitro (node)   ${TRAVEL.dir}   service ${TRAVEL.service}.service :3000
  database   ${TRAVEL.db}
  deploy     AUTO: djiwa-autodeploy.timer tiap 3 menit -> pull main, migrasi, build, swap, verifikasi, rollback
  timers     djiwatravel-esim-sync (sweep bayar + sync eSIM), djiwatravel-affiliate-sweep
  webhooks   /api/webhooks/esim-access/<token>   (eSIM Access -> Travel)
             /api/webhooks/mayar-forward         (Tentram -> Travel, HMAC, sinyal saja)
             /api/internal/member-purchases      (Tentram -> Travel, HMAC, baca pembelian member)

DJIWA TENTRAM / PAY  — ${TENTRAM.ssh}   (repo lokal: ${TENTRAM.repo})
  auth       Better Auth ${TENTRAM.authService}.service :3001  ${TENTRAM.urls.auth}   <- SEMUA login Travel lewat sini
  wallet     Djiwa Pay: saldo, ledger, settlement, Mayar  (Postgres supabase-db, schema pos)
  functions  Supabase edge functions  ${TENTRAM.urls.functions}  (volume ${TENTRAM.functionsDir})
  pay web    ${TENTRAM.urls.pay}  (frontend dibangun di laptop, di-rsync ke /opt/djiwapay-releases, symlink dist)
  deploy     MANUAL (tidak ada auto-deploy). Checkout VPS berada di branch snapshot dan MENYIMPANG dari repo.
  mayar      satu akun Mayar = satu webhook -> Tentram mayar-webhook -> meneruskan sinyal ke Travel

ALIRAN LINTAS VPS
  login        browser -> Travel -> ${TENTRAM.urls.auth} (session Better Auth; owner diturunkan di server)
  saldo/ledger Travel -> customer-wallet (Tentram)         pembayaran saldo: Tentram menulis ledger (source_app=djiwa-travel)
  bayar QRIS   Travel -> Mayar invoice; Mayar -> Tentram webhook -> sinyal -> Travel settle (+ sweep 1 menit sebagai cadangan)
  riwayat Pay  Pay web -> auth-server -> (Tentram DB) + (Travel member-purchases, bertanda tangan)
`;

// ---------------------------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------------------------
const useColor = process.stdout.isTTY && !process.env["NO_COLOR"];
const paint = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const green = (t) => paint("32", t);
const red = (t) => paint("31", t);
const yellow = (t) => paint("33", t);
const dim = (t) => paint("2", t);
const bold = (t) => paint("1", t);

function die(message, code = 1) {
  console.error(red(`ERROR: ${message}`));
  process.exit(code);
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function gitSafe(args) {
  try {
    return git(args);
  } catch {
    return "";
  }
}

/** Run a command on a VPS. `input` goes to the remote command's stdin. */
function ssh(host, command, { input, timeout = 60_000 } = {}) {
  const result = spawnSync(
    "ssh",
    ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", host.ssh, command],
    { input, encoding: "utf8", timeout, maxBuffer: 20 * 1024 * 1024 },
  );
  return {
    code: result.status ?? 1,
    out: (result.stdout ?? "").trimEnd(),
    err: (result.stderr ?? "").trimEnd(),
  };
}

function sshOrDie(host, command, options) {
  const result = ssh(host, command, options);
  if (result.code !== 0) die(`${host.name}: ${result.err || result.out || `exit ${result.code}`}`);
  return result.out;
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...options });
  return result.status ?? 1;
}

function capture(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
    ...options,
  });
  return { code: result.status ?? 1, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** Formats generated files with the repo's own prettier so scaffolds pass lint as written. */
function formatFiles(files) {
  const relative = files.map((file) => file.replace(`${ROOT}/`, ""));
  const result = capture("npx", ["prettier", "--write", ...relative]);
  if (result.code !== 0) console.error(yellow(`prettier gagal: ${result.out.split("\n")[0]}`));
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function httpStatus(url, init = {}) {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
      ...init,
    });
    return { status: response.status, response };
  } catch (error) {
    return { status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

function line(ok, label, detail = "") {
  const mark = ok === true ? green("✓") : ok === false ? red("✗") : yellow("•");
  console.log(`  ${mark} ${label}${detail ? dim(`  ${detail}`) : ""}`);
}

// ---------------------------------------------------------------------------------------------
// Public / cross-VPS checks (shared by status, verify and ship)
// ---------------------------------------------------------------------------------------------
async function homeAssetCheck(base) {
  const home = await httpStatus(`${base}/`, { redirect: "follow" });
  if (home.status !== 200) return { ok: false, detail: `beranda ${home.status || home.error}` };
  const html = await home.response.text();
  const assets = extractAssets(html);
  if (assets.length === 0) return { ok: false, detail: "beranda tidak merujuk JS/CSS" };
  const bad = [];
  let index = 0;
  async function worker() {
    while (index < assets.length) {
      const asset = assets[index++];
      const result = await httpStatus(`${base}${asset}`);
      if (result.status !== 200) bad.push(`${asset} ${result.status}`);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  return bad.length
    ? { ok: false, detail: `${bad.length}/${assets.length} aset gagal, mis. ${bad[0]}` }
    : { ok: true, detail: `${assets.length} aset JS/CSS dilayani 200` };
}

function staticRoutes() {
  const result = capture("bash", ["scripts/list-routes.sh"]);
  return result.out
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("/"));
}

async function publicChecks({ routes = true } = {}) {
  const results = [];
  const push = (ok, label, detail) => results.push({ ok, label, detail });

  const assets = await homeAssetCheck(TRAVEL.url);
  push(assets.ok, "Travel: beranda + aset", assets.detail);

  if (routes) {
    const paths = staticRoutes().filter((path) => !path.startsWith("/api/"));
    const bad = [];
    for (const path of paths) {
      const { status } = await httpStatus(`${TRAVEL.url}${path}`);
      if (!(status >= 200 && status < 400)) bad.push(`${path} ${status}`);
    }
    push(
      bad.length === 0,
      `Travel: ${paths.length} route statis`,
      bad.length ? bad.slice(0, 3).join(", ") : "semua 2xx/3xx",
    );
  }

  // Cross-VPS contracts: each internal endpoint must exist AND refuse unsigned callers.
  const contract = async (label, url, expected, init = {}) => {
    const { status, error } = await httpStatus(url, init);
    push(
      status === expected,
      label,
      status === expected ? `${status}` : `diharapkan ${expected}, dapat ${status || error}`,
    );
  };
  const post = { method: "POST", headers: { "content-type": "application/json" }, body: "{}" };
  await contract(
    "Travel: mayar-forward menolak tanpa tanda tangan",
    `${TRAVEL.url}/api/webhooks/mayar-forward`,
    401,
    post,
  );
  await contract(
    "Travel: member-purchases menolak tanpa tanda tangan",
    `${TRAVEL.url}/api/internal/member-purchases`,
    401,
    post,
  );
  await contract(
    "Travel: webhook eSIM menolak token salah",
    `${TRAVEL.url}/api/webhooks/esim-access/wrong-token`,
    404,
    post,
  );
  await contract("Tentram: mayar-webhook hidup", `${TENTRAM.urls.functions}/mayar-webhook`, 200);
  await contract(
    "Tentram: mayar-webhook menolak token salah",
    `${TENTRAM.urls.functions}/mayar-webhook?token=wrong`,
    401,
    post,
  );
  const auth = await httpStatus(`${TENTRAM.urls.auth}/`);
  push(
    auth.status > 0 && auth.status < 500,
    "Tentram: Better Auth terjangkau",
    `${auth.status || auth.error}`,
  );
  const pay = await httpStatus(`${TENTRAM.urls.pay}/`, { redirect: "follow" });
  push(pay.status === 200, "Pay web (djiwapay.web.id)", `${pay.status || pay.error}`);
  return results;
}

function printChecks(results) {
  for (const result of results) line(result.ok, result.label, result.detail);
  return results.every((result) => result.ok);
}

// ---------------------------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------------------------
const COMMANDS = {};

COMMANDS.topology = {
  summary: "peta: apa yang hidup di VPS mana, dan aliran lintas VPS",
  run() {
    console.log(TOPOLOGY);
  },
};

COMMANDS.doctor = {
  summary: "cek alat lokal + SSH ke kedua VPS",
  async run() {
    console.log(bold("Alat lokal"));
    line(true, `node ${process.version}`);
    for (const tool of ["git", "ssh", "npx", "curl"]) {
      const found = capture("sh", ["-c", `command -v ${tool}`]).code === 0;
      line(found, tool);
    }
    const sshConfig = existsSync(join(homedir(), ".ssh", "config"))
      ? readFileSync(join(homedir(), ".ssh", "config"), "utf8")
      : "";
    console.log(bold("\nSSH"));
    for (const host of [TRAVEL, TENTRAM]) {
      const configured = sshConfig.includes(`Host ${host.ssh}`);
      const reach = ssh(host, "hostname && whoami");
      line(
        reach.code === 0,
        `${host.name} (${host.ssh})`,
        reach.code === 0
          ? reach.out.replace("\n", " / ")
          : `${configured ? "alias ada" : "alias TIDAK ada di ~/.ssh/config"}; ${reach.err.split("\n")[0]}`,
      );
    }
    console.log(bold("\nRepo Tentram lokal"));
    line(
      existsSync(join(TENTRAM.repo, ".git")),
      TENTRAM.repo,
      "set DJIWA_TENTRAM_REPO bila berbeda",
    );
  },
};

COMMANDS.status = {
  summary: "ringkasan: git lokal, kedua VPS, deploy, timer, cek publik",
  async run(args) {
    const { flags } = parseArgs(args, { booleans: ["quick"] });
    let healthy = true;
    const mark = (ok) => {
      if (ok === false) healthy = false;
      return ok;
    };

    console.log(bold("Lokal"));
    const branch = gitSafe(["rev-parse", "--abbrev-ref", "HEAD"]);
    gitSafe(["fetch", "--quiet", "origin", "main"]);
    const counts = gitSafe(["rev-list", "--left-right", "--count", "HEAD...origin/main"]).split(
      /\s+/,
    );
    const dirty = gitSafe(["status", "--porcelain"]).split("\n").filter(Boolean);
    line(
      branch === "main" ? true : null,
      `branch ${branch}`,
      `ahead ${counts[0] ?? "?"} / behind ${counts[1] ?? "?"} vs origin/main`,
    );
    line(
      dirty.length === 0 ? true : null,
      dirty.length === 0 ? "worktree bersih" : `${dirty.length} perubahan belum di-commit`,
      dirty
        .slice(0, 5)
        .map((entry) => entry.trim())
        .join("; "),
    );

    console.log(bold("\nTravel VPS"));
    const travelScript = [
      `echo head=$(git -C ${TRAVEL.dir} rev-parse --short HEAD)`,
      `echo deployed=$(cut -c1-7 ${TRAVEL.dir}/.deployed-sha 2>/dev/null)`,
      `for u in ${TRAVEL.service} djiwa-autodeploy.timer djiwatravel-esim-sync.timer djiwatravel-affiliate-sweep.timer; do echo unit:$u=$(systemctl is-active $u); done`,
      `(flock -n 9 && echo lock=free || echo lock=held) 9>/tmp/djiwa-autodeploy.lock`,
      `echo load=$(cut -d' ' -f1 /proc/loadavg)`,
      `echo lastdeploy=$(sudo -n journalctl -u djiwa-autodeploy --since "-1day" --no-pager 2>/dev/null | grep -E "=== OK|ROLLBACK|GAGAL" | tail -1 | cut -c40-140)`,
    ].join("; ");
    const travel = ssh(TRAVEL, travelScript);
    if (travel.code !== 0) {
      line(mark(false), "SSH gagal", travel.err.split("\n")[0]);
    } else {
      const info = Object.fromEntries(
        travel.out.split("\n").map((entry) => entry.split(/=(.*)/s).slice(0, 2)),
      );
      const origin = gitSafe(["rev-parse", "--short", "origin/main"]);
      line(
        mark(info["deployed"] === origin),
        `deploy: terpasang ${info["deployed"]} | origin/main ${origin}`,
        info["deployed"] === origin
          ? "sinkron"
          : "autodeploy akan menyusul (maks ~3 menit) atau gagal",
      );
      line(
        mark(info["lock"] === "free" ? true : null),
        `lock deploy: ${info["lock"]}`,
        info["lock"] === "held" ? "deploy sedang berjalan" : "",
      );
      for (const [key, value] of Object.entries(info)) {
        if (key.startsWith("unit:")) line(mark(value === "active"), key.slice(5), value);
      }
      line(null, `load ${info["load"]}`, info["lastdeploy"] ?? "");
    }

    console.log(bold("\nTentram VPS (auth, Pay, edge functions)"));
    const tentramScript = [
      `for u in ${TENTRAM.authService} nginx djiwa-mayar-processor.timer; do echo unit:$u=$(systemctl is-active $u); done`,
      `echo edge="$(sudo -n docker ps --filter name=supabase-edge-functions --format '{{.Status}}' 2>/dev/null)"`,
      `echo db="$(sudo -n docker ps --filter name=supabase-db --format '{{.Status}}' 2>/dev/null)"`,
      `echo pay=$(readlink ${TENTRAM.payDist} | xargs -r basename)`,
    ].join("; ");
    const tentram = ssh(TENTRAM, tentramScript);
    if (tentram.code !== 0) {
      line(mark(false), "SSH gagal", tentram.err.split("\n")[0]);
    } else {
      const info = Object.fromEntries(
        tentram.out.split("\n").map((entry) => entry.split(/=(.*)/s).slice(0, 2)),
      );
      for (const [key, value] of Object.entries(info)) {
        if (key.startsWith("unit:")) line(mark(value === "active"), key.slice(5), value);
      }
      line(
        mark(/healthy|Up/.test(info["edge"] ?? "")),
        "edge functions",
        info["edge"] || "tidak berjalan",
      );
      line(
        mark(/healthy|Up/.test(info["db"] ?? "")),
        "database Tentram (supabase-db)",
        info["db"] || "tidak berjalan",
      );
      line(null, "rilis Pay", info["pay"] ?? "");
    }

    if (!flags["quick"]) {
      console.log(bold("\nCek publik + kontrak lintas VPS"));
      const ok = printChecks(await publicChecks({ routes: false }));
      mark(ok);
    }
    console.log(healthy ? green("\nSEMUA SEHAT") : red("\nADA MASALAH (lihat tanda ✗)"));
    process.exitCode = healthy ? 0 : 1;
  },
};

COMMANDS.verify = {
  summary: "cek publik penuh: beranda+aset, semua route statis, kontrak lintas VPS",
  async run() {
    const ok = printChecks(await publicChecks({ routes: true }));
    console.log(ok ? green("\nOK") : red("\nGAGAL"));
    process.exitCode = ok ? 0 : 1;
  },
};

function changedFiles() {
  const tracked = gitSafe(["diff", "--name-only", "HEAD"]).split("\n").filter(Boolean);
  const untracked = gitSafe(["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .filter(Boolean);
  return [...new Set([...tracked, ...untracked])];
}

function gate(paths, { full = false } = {}) {
  const files = selectPaths(changedFiles(), paths);
  if (files.length === 0 && !full) {
    console.log(yellow("Tidak ada file berubah untuk diperiksa."));
    return true;
  }
  let ok = true;
  const sources = files.filter(
    (file) => /\.(ts|tsx|mjs|js)$/.test(file) && existsSync(join(ROOT, file)),
  );
  console.log(bold(`Gate: ${files.length} file (${sources.length} kode)`));

  if (sources.length > 0) {
    const lint = capture("npx", ["eslint", ...sources]);
    line(
      lint.code === 0,
      "eslint",
      lint.code === 0 ? "" : lint.out.split("\n").slice(0, 8).join("\n"),
    );
    ok &&= lint.code === 0;

    const tsc = capture("npx", ["tsc", "--noEmit"]);
    const mine = tsc.out
      .split("\n")
      .filter((entry) => sources.some((file) => entry.startsWith(file)));
    line(
      mine.length === 0,
      "tsc (hanya file yang diubah)",
      mine.length === 0 ? "bersih" : mine.slice(0, 6).join("\n"),
    );
    ok &&= mine.length === 0;
  }

  const testable = sources.filter((file) => file.startsWith("src/"));
  if (full) {
    const code = run("npx", ["vitest", "run"]);
    line(code === 0, "vitest (suite penuh)");
    ok &&= code === 0;
  } else if (testable.length > 0) {
    const related = capture("npx", ["vitest", "related", "--run", ...testable]);
    const summary = related.out
      .split("\n")
      .filter((entry) => /Test Files|Tests /.test(entry))
      .join(" | ");
    line(
      related.code === 0,
      "vitest related",
      summary || related.out.split("\n").slice(-6).join("\n"),
    );
    ok &&= related.code === 0;
  }
  return ok;
}

COMMANDS.gate = {
  summary:
    "gate lokal: eslint + tsc (file berubah) + vitest related   [--full = suite penuh] [path...]",
  run(args) {
    const { flags, positional } = parseArgs(args, { booleans: ["full"] });
    const ok = gate(positional, { full: Boolean(flags["full"]) });
    console.log(ok ? green("\nGATE LULUS") : red("\nGATE GAGAL"));
    process.exitCode = ok ? 0 : 1;
  },
};

async function waitDeploy(targetShort, timeoutSeconds = 600) {
  console.log(`Menunggu autodeploy memasang ${targetShort} ...`);
  const started = Date.now();
  while (Date.now() - started < timeoutSeconds * 1000) {
    const out = ssh(
      TRAVEL,
      `cut -c1-7 ${TRAVEL.dir}/.deployed-sha; systemctl is-active ${TRAVEL.service}`,
    );
    const [deployed, service] = out.out.split("\n");
    if (deployed === targetShort && service === "active") {
      const ready = await httpStatus(`${TRAVEL.url}/`, { redirect: "follow" });
      if (ready.status === 200) return true;
    }
    const failure = ssh(
      TRAVEL,
      `sudo -n journalctl -u djiwa-autodeploy --since "-5min" --no-pager | grep -E "ROLLBACK|GAGAL|ERROR" | tail -2 | cut -c40-200`,
    );
    if (failure.out) {
      console.error(red(`Autodeploy melaporkan masalah:\n${failure.out}`));
      return false;
    }
    await sleep(10_000);
  }
  console.error(red(`Timeout ${timeoutSeconds}s menunggu ${targetShort}`));
  return false;
}

COMMANDS["wait-deploy"] = {
  summary: "tunggu autodeploy memasang commit (default HEAD) lalu verifikasi",
  async run(args) {
    const { positional } = parseArgs(args);
    const target = positional[0]
      ? gitSafe(["rev-parse", "--short", positional[0]])
      : gitSafe(["rev-parse", "--short", "HEAD"]);
    const ok = (await waitDeploy(target)) && printChecks(await publicChecks({ routes: false }));
    process.exitCode = ok ? 0 : 1;
  },
};

COMMANDS.ship = {
  summary:
    'gate -> commit file yang disebut -> push main -> tunggu autodeploy -> verifikasi   ship -m "pesan" path...',
  async run(args) {
    const { flags, positional } = parseArgs(args, {
      booleans: ["no-wait", "skip-gate", "dry-run", "full"],
      aliases: { m: "message" },
    });
    const message = flags["message"];
    if (typeof message !== "string" || !message.trim())
      die('butuh pesan commit: ship -m "feat(x): ..." path...');
    if (positional.length === 0)
      die("sebut file/folder yang ikut commit (ship tidak pernah `git add -A`)");
    const broad = positional.find(isBroadPath);
    if (broad)
      die(
        `path terlalu luas: "${broad}". Sebut file/folder yang spesifik; perubahan lain milik orang lain.`,
      );

    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
    if (branch !== "main")
      die(`ship hanya untuk main (sekarang: ${branch}); autodeploy memantau main`);

    const files = selectPaths(changedFiles(), positional);
    if (files.length === 0) die("tidak ada perubahan pada path yang disebut");
    const others = changedFiles().filter((file) => !files.includes(file));
    console.log(bold("Akan di-commit:"));
    for (const file of files) console.log(`  + ${file}`);
    if (others.length)
      console.log(
        dim(
          `  (${others.length} perubahan lain TIDAK disentuh: ${others.slice(0, 4).join(", ")}${others.length > 4 ? ", ..." : ""})`,
        ),
      );
    if (flags["dry-run"]) return;

    if (!flags["skip-gate"] && !gate(positional, { full: Boolean(flags["full"]) }))
      die("gate gagal; perbaiki dulu (atau --skip-gate bila kamu sadar risikonya)");

    git(["add", "--", ...files]);
    const body = COAUTHOR ? `${message}\n\n${COAUTHOR}` : message;
    git(["commit", "-m", body]);
    const sha = git(["rev-parse", "--short", "HEAD"]);
    console.log(green(`commit ${sha}`));

    git(["fetch", "--quiet", "origin", "main"]);
    const behind = Number(gitSafe(["rev-list", "--count", "HEAD..origin/main"]) || "0");
    if (behind > 0) {
      console.log(`origin/main maju ${behind} commit; rebase ...`);
      try {
        git(["rebase", "origin/main"]);
      } catch (error) {
        gitSafe(["rebase", "--abort"]);
        die(
          `rebase gagal, dibatalkan. Selesaikan manual. ${error instanceof Error ? error.message.split("\n")[0] : ""}`,
        );
      }
    }
    git(["push", "origin", "HEAD:main"]);
    const pushed = git(["rev-parse", "--short", "HEAD"]);
    console.log(green(`push ${pushed} -> origin/main`));

    if (flags["no-wait"]) return;
    const deployed = await waitDeploy(pushed);
    if (!deployed) process.exit(1);
    console.log(green(`deploy ${pushed} terpasang`));
    const ok = printChecks(await publicChecks({ routes: false }));
    console.log(
      ok
        ? green(`\nSELESAI  local ✓  commit ✓  push ✓  deploy ✓  service ✓  publik ✓   (${pushed})`)
        : red("\nDeploy terpasang tetapi cek publik GAGAL; periksa `djiwa logs autodeploy`"),
    );
    process.exitCode = ok ? 0 : 1;
  },
};

const LOG_TARGETS = {
  travel: {
    host: TRAVEL,
    cmd: (n, since) => `sudo -n journalctl -u ${TRAVEL.service} -n ${n} ${since} --no-pager`,
  },
  autodeploy: {
    host: TRAVEL,
    cmd: (n, since) =>
      `sudo -n journalctl -u djiwa-autodeploy -n ${n} ${since} --no-pager | grep -v " kB"`,
  },
  sweep: {
    host: TRAVEL,
    cmd: (n, since) =>
      `sudo -n journalctl -u djiwatravel-esim-sync -n ${n} ${since} --no-pager -o cat`,
  },
  affiliate: {
    host: TRAVEL,
    cmd: (n, since) =>
      `sudo -n journalctl -u djiwatravel-affiliate-sweep -n ${n} ${since} --no-pager -o cat`,
  },
  nginx: { host: TRAVEL, cmd: (n) => `sudo -n tail -n ${n} /var/log/nginx/error.log` },
  auth: {
    host: TENTRAM,
    cmd: (n, since) => `sudo -n journalctl -u ${TENTRAM.authService} -n ${n} ${since} --no-pager`,
  },
  edge: {
    host: TENTRAM,
    cmd: (n, since) =>
      `sudo -n docker logs supabase-edge-functions --tail ${n} ${since.replace("--since", "--since").replace(/"/g, "'")} 2>&1`,
  },
  mayar: {
    host: TENTRAM,
    cmd: (n, since) =>
      `sudo -n journalctl -u djiwa-mayar-processor -n ${n} ${since} --no-pager -o cat`,
  },
};

COMMANDS.logs = {
  summary: `log VPS: ${Object.keys(LOG_TARGETS).join(" | ")}   [-n 80] [--since "30 min ago"] [--grep pola]`,
  run(args) {
    const { flags, positional } = parseArgs(args, { aliases: { n: "lines", g: "grep" } });
    const target = LOG_TARGETS[positional[0]];
    if (!target) die(`target log: ${Object.keys(LOG_TARGETS).join(", ")}`);
    const lines = Math.max(1, Math.min(Number(flags["lines"] ?? 80), 1000));
    const since =
      typeof flags["since"] === "string" ? `--since "${flags["since"].replace(/"/g, "")}"` : "";
    let command = target.cmd(lines, since);
    if (typeof flags["grep"] === "string")
      command += ` | grep -i -E '${flags["grep"].replace(/'/g, "")}'`;
    const result = ssh(target.host, command, { timeout: 90_000 });
    console.log(result.out || dim("(kosong)"));
    if (result.code !== 0 && result.err) console.error(dim(result.err));
  },
};

function psqlFor(which) {
  if (which === "travel") return { host: TRAVEL, cmd: "psql djiwatravel -X -v ON_ERROR_STOP=1" };
  if (which === "tentram")
    return {
      host: TENTRAM,
      cmd: "sudo -n docker exec -i supabase-db psql -U postgres -X -v ON_ERROR_STOP=1",
    };
  die('database: "travel" atau "tentram"');
}

COMMANDS.db = {
  summary:
    'SQL baca-saja: db travel|tentram "select ..."   |   db <db> --tables   |   db <db> --describe tabel   |   db migrations',
  run(args) {
    const { flags, positional } = parseArgs(args, { booleans: ["tables"] });
    if (positional[0] === "migrations") {
      console.log(
        sshOrDie(TRAVEL, `cd ${TRAVEL.dir} && bash scripts/apply-migrations.sh --status`),
      );
      return;
    }
    const which = positional[0];
    const target = psqlFor(which);
    let sql = positional.slice(1).join(" ");
    if (flags["tables"]) {
      sql =
        which === "tentram"
          ? "select table_schema, table_name from information_schema.tables where table_schema in ('pos','public') order by 1,2"
          : "select table_name from information_schema.tables where table_schema='public' order by 1";
    } else if (typeof flags["describe"] === "string") {
      const table = flags["describe"].replace(/[^A-Za-z0-9_.]/g, "");
      const [schema, name] = table.includes(".")
        ? table.split(".")
        : [which === "tentram" ? "pos" : "public", table];
      sql = `select column_name, data_type, is_nullable from information_schema.columns where table_schema='${schema}' and table_name='${name}' order by ordinal_position`;
    }
    let statement;
    try {
      statement = assertReadOnlySql(sql);
    } catch (error) {
      die(error instanceof Error ? error.message : String(error));
    }
    console.error(
      dim(
        `[${target.host.name}] baca-saja (BEGIN READ ONLY); data pelanggan bisa muncul, jangan ditempel ke tempat publik`,
      ),
    );
    const script = `BEGIN READ ONLY;\n${statement};\nROLLBACK;\n`;
    const result = ssh(target.host, target.cmd, { input: script, timeout: 90_000 });
    console.log(result.out.replace(/^BEGIN\n?/m, "").replace(/\nROLLBACK$/m, ""));
    if (result.code !== 0) die(result.err || "query gagal");
  },
};

COMMANDS.sweep = {
  summary: "jalankan sekarang sweep pembayaran + sync eSIM di Travel (aman, idempoten)",
  run() {
    const out = sshOrDie(
      TRAVEL,
      `sudo -n systemctl start djiwatravel-esim-sync.service; sudo -n journalctl -u djiwatravel-esim-sync -n 6 --no-pager -o cat`,
    );
    console.log(out);
  },
};

function remoteFingerprint(host, file, name) {
  const result = ssh(
    host,
    `sudo -n grep -h "^${name}=" ${file} 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\\r"' | tr -d '\\n' | sha256sum | cut -c1-12`,
  );
  const empty = createHash("sha256").update("").digest("hex").slice(0, 12);
  return result.code === 0 && result.out && result.out !== empty ? result.out : null;
}

COMMANDS.env = {
  summary:
    "cek NAMA env (tak pernah nilai): template vs Travel, dan kontrak rahasia lintas VPS (fingerprint)",
  run() {
    const template = parseEnvNames(readFileSync(join(ROOT, ".env.example"), "utf8"));
    const present = sshOrDie(
      TRAVEL,
      `sudo -n grep -h -E "^[A-Z][A-Z0-9_]*=." ${TRAVEL.envFile} ${TRAVEL.taskEnvFile} 2>/dev/null | cut -d= -f1 | sort -u`,
    ).split("\n");
    console.log(bold(`Travel: .env.example vs ${TRAVEL.envFile}`));
    const missing = template.filter((name) => !present.includes(name));
    line(
      missing.length === 0 ? true : null,
      `${template.length - missing.length}/${template.length} nama terisi`,
      missing.length ? `kosong/hilang: ${missing.join(", ")}` : "",
    );
    console.log(bold("\nKontrak rahasia lintas VPS (fingerprint sama = nilai sama)"));
    const pairs = [
      [
        "DJIWA_TRAVEL_CALLBACK_SECRET",
        [
          [TRAVEL, TRAVEL.envFile],
          [TENTRAM, TENTRAM.authEnvFile],
          [TENTRAM, `${TENTRAM.selfhost}/.env`],
        ],
      ],
      [
        "DJIWA_TRAVEL_SETTLEMENT_SECRET",
        [
          [TRAVEL, TRAVEL.envFile],
          [TENTRAM, `${TENTRAM.selfhost}/.env`],
        ],
      ],
    ];
    for (const [name, places] of pairs) {
      const prints = places.map(([host, file]) => ({
        where: `${host.name}:${file.split("/").pop()}`,
        print: remoteFingerprint(host, file, name),
      }));
      const set = prints.filter((p) => p.print);
      const same = set.length === prints.length && new Set(set.map((p) => p.print)).size === 1;
      line(
        same,
        name,
        prints.map((p) => `${p.where}=${p.print ? p.print.slice(0, 6) : "KOSONG"}`).join("  "),
      );
    }
    const single = [
      ["Tentram auth-server", TENTRAM.authEnvFile, ["DJIWA_TRAVEL_PURCHASES_URL"]],
      [
        "Tentram selfhost",
        `${TENTRAM.selfhost}/.env`,
        ["MAYAR_API_KEY", "MAYAR_WEBHOOK_TOKEN", "DJIWA_TRAVEL_CALLBACK_URL"],
      ],
    ];
    for (const [label, file, names] of single) {
      for (const name of names)
        line(Boolean(remoteFingerprint(TENTRAM, file, name)), `${label}: ${name}`);
    }
  },
};

function localHash(path) {
  return existsSync(path)
    ? createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 12)
    : null;
}

COMMANDS.drift = {
  summary:
    "bandingkan kode Tentram yang AKTIF di VPS dengan repo lokal (hindari menimpa tambalan langsung)",
  run() {
    console.log(bold("Tentram: file aktif vs repo lokal"), dim(`(${TENTRAM.repo})`));
    const files = [
      [
        `${TENTRAM.functionsDir}/mayar-webhook/index.ts`,
        "supabase/functions/mayar-webhook/index.ts",
      ],
      [
        `${TENTRAM.functionsDir}/mayar-webhook/travel-forward.ts`,
        "supabase/functions/mayar-webhook/travel-forward.ts",
      ],
      [
        `${TENTRAM.functionsDir}/customer-wallet/index.ts`,
        "supabase/functions/customer-wallet/index.ts",
      ],
      [
        `${TENTRAM.functionsDir}/mayar-payment-processor/index.ts`,
        "supabase/functions/mayar-payment-processor/index.ts",
      ],
      [`${TENTRAM.authDir}/src/index.ts`, "apps/auth-server/src/index.ts"],
    ];
    for (const [remote, relative] of files) {
      const live = ssh(TENTRAM, `sudo -n sha256sum ${remote} 2>/dev/null | cut -c1-12`).out || null;
      const local = localHash(join(TENTRAM.repo, relative));
      const same = live !== null && live === local;
      line(
        live === null || local === null ? null : same,
        relative,
        live === null
          ? "tidak ada di VPS"
          : local === null
            ? "tidak ada di repo"
            : same
              ? "identik"
              : "BERBEDA: jangan deploy dengan menimpa; tambal minimal file aktif",
      );
    }
    console.log(
      dim(
        "\nBerbeda tidak selalu salah (ada tambalan langsung lama), tetapi itu artinya salin-timpa dari repo akan menghapus fitur aktif.",
      ),
    );
    console.log(bold("\nTravel: terpasang vs origin/main"));
    gitSafe(["fetch", "--quiet", "origin", "main"]);
    const deployed = ssh(TRAVEL, `cut -c1-7 ${TRAVEL.dir}/.deployed-sha`).out;
    const origin = gitSafe(["rev-parse", "--short", "origin/main"]);
    line(deployed === origin, `terpasang ${deployed} | origin/main ${origin}`);
  },
};

COMMANDS.new = {
  summary:
    "scaffold: new migration <nama> | new route </path> | new api </path> [--kind task|signed]",
  run(args) {
    const { flags, positional } = parseArgs(args);
    const kind = positional[0];
    const target = positional[1];
    if (!kind || !target)
      die(
        "pemakaian: new migration <nama> | new route </path> | new api </path> [--kind task|signed]",
      );

    if (kind === "migration") {
      const dir = join(ROOT, "migrations");
      const number = nextMigrationNumber(readdirSync(dir));
      const slug = slugify(target);
      if (!slug) die("nama migrasi tidak valid");
      const file = join(dir, `${number}_${slug}.sql`);
      writeFileSync(
        file,
        `-- ${number}_${slug}.sql\n-- Additive dan idempoten: aman dijalankan ulang, tidak menghapus data.\n-- Cek: djiwa db migrations   (status)   |   deploy menjalankan scripts/apply-migrations.sh\n\nBEGIN;\n\n-- contoh:\n-- CREATE TABLE IF NOT EXISTS public.example (\n--   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n--   created_at timestamptz NOT NULL DEFAULT now()\n-- );\n-- ALTER TABLE public.example ADD COLUMN IF NOT EXISTS note text;\n\nCOMMIT;\n`,
      );
      console.log(green(`dibuat ${file.replace(`${ROOT}/`, "")}`));
      console.log(
        dim(
          "Ingat: tambahkan juga ke drizzle/schema.ts bila kolom/tabel dipakai kode, dan uji di DB lokal (scripts/start-local-db.sh).",
        ),
      );
      return;
    }

    if (kind === "route") {
      const file = join(ROOT, "src/routes", routeFileFor(target));
      if (existsSync(file)) die(`${file.replace(`${ROOT}/`, "")} sudah ada`);
      const path = target.startsWith("/") ? target : `/${target}`;
      writeFileSync(
        file,
        `import { createFileRoute } from "@tanstack/react-router";\n\nexport const Route = createFileRoute("${path}")({\n  head: () => ({ meta: [{ title: "TODO — Djiwa Travel" }] }),\n  component: Page,\n});\n\n// Matriks permukaan (AGENTS.md): sebutkan pintu customer, kontrol admin, sumber data, izin,\n// state kosong/loading/error, dan tes yang membuktikannya. \`djiwa matrix\` mencetak templatnya.\nfunction Page() {\n  return (\n    <main className="px-4 py-6">\n      <h1 className="text-lg font-semibold">TODO</h1>\n    </main>\n  );\n}\n`,
      );
      formatFiles([file]);
      console.log(green(`dibuat ${file.replace(`${ROOT}/`, "")}`));
      console.log(
        dim(
          "routeTree.gen.ts dibuat ulang oleh `npx vite build` / `npm run dev`; commit hasilnya.",
        ),
      );
      return;
    }

    if (kind === "api") {
      const api = flags["kind"] ?? "task";
      if (!["task", "signed"].includes(api)) die("--kind task|signed");
      const file = join(
        ROOT,
        "src/routes",
        routeFileFor(`/api/${target.replace(/^\/?api\//, "").replace(/^\//, "")}`).replace(
          /\.tsx$/,
          ".ts",
        ),
      );
      if (existsSync(file)) die(`${file.replace(`${ROOT}/`, "")} sudah ada`);
      const path = `/api/${target.replace(/^\/?api\//, "").replace(/^\//, "")}`;
      const guard =
        api === "signed"
          ? `import { verifyTentramSignedRequest } from "@/lib/tentram-signed-request.server";\n\n// Dipanggil Tentram (server ke server): HMAC DJIWA_TRAVEL_CALLBACK_SECRET + header x-djiwa-source.\nasync function receive(request: Request) {\n  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });\n  if (request.headers.get("origin") || request.headers.get("referer")) return Response.json({ error: "server_only" }, { status: 403 });\n  const rawBody = await request.text();\n  if (!verifyTentramSignedRequest(rawBody, request)) return Response.json({ error: "Unauthorized" }, { status: 401 });\n  // TODO: kerja idempoten; jangan percaya isi body sebagai bukti pembayaran.\n  return Response.json({ ok: true });\n}\n`
          : `import { timingSafeEqual } from "node:crypto";\n\n// Dipanggil timer systemd di VPS: header x-djiwa-task-secret = nilai env (set di /etc/djiwatravel-task.env).\nconst SECRET_ENV = "TODO_TASK_SECRET";\nfunction secretMatches(supplied: string, configured: string) {\n  const a = Buffer.from(supplied);\n  const b = Buffer.from(configured);\n  return a.length === b.length && timingSafeEqual(a, b);\n}\n\nasync function receive(request: Request) {\n  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });\n  if (request.headers.get("origin") || request.headers.get("referer")) return Response.json({ error: "server_only" }, { status: 403 });\n  const configured = (process.env[SECRET_ENV] ?? "").trim();\n  if (!configured) return Response.json({ error: "task_not_configured" }, { status: 503 });\n  if (!secretMatches((request.headers.get("x-djiwa-task-secret") ?? "").trim(), configured)) return Response.json({ error: "unauthorized" }, { status: 401 });\n  // TODO: kerja idempoten dan aman diulang.\n  return Response.json({ ok: true });\n}\n`;
      writeFileSync(
        file,
        `import { createFileRoute } from "@tanstack/react-router";\n${guard}\nexport const Route = createFileRoute("${path}")({\n  server: { handlers: { POST: ({ request }) => receive(request) } },\n});\n`,
      );
      formatFiles([file]);
      console.log(green(`dibuat ${file.replace(`${ROOT}/`, "")}`));
      console.log(
        dim(
          "Tambahkan tes seperti src/test/member-purchases-endpoint.test.ts dan regenerasi routeTree.gen.ts.",
        ),
      );
      return;
    }
    die(`jenis scaffold tidak dikenal: ${kind}`);
  },
};

COMMANDS.matrix = {
  summary: "cetak templat matriks permukaan customer/admin (AGENTS.md) untuk rencana/handoff",
  run() {
    console.log(`Matriks permukaan — <fitur>
| Aspek                     | Customer                    | Admin                         |
| ------------------------- | --------------------------- | ----------------------------- |
| Pintu masuk / hasil       |                             |                               |
| Sumber kebenaran          |                             |                               |
| Izin / kepemilikan        | owner dari session server   | guard admin                   |
| State kosong/loading/error|                             |                               |
| Tes yang membuktikan      |                             |                               |
| VPS / DB yang tersentuh   | Travel / Tentram (auth,Pay) |                               |
Handoff: local ☐ commit ☐ push ☐ deploy ☐ service ☐ publik ☐`);
  },
};

// ---------------------------------------------------------------------------------------------
function help() {
  console.log(`${bold("djiwa")} — CLI kerja Djiwa Travel + Tentram/Pay (2 VPS)\n`);
  console.log("Pemakaian: scripts/djiwa <perintah> [opsi]   (atau: npm run djiwa -- <perintah>)\n");
  const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length));
  for (const [name, command] of Object.entries(COMMANDS))
    console.log(`  ${name.padEnd(width + 2)}${command.summary}`);
  console.log(
    `\nAlur harian: ${bold("status")} -> kode -> ${bold("gate")} -> ${bold('ship -m "..." <path>')}  (autodeploy memasang <= ~3 menit, lalu verifikasi otomatis)`,
  );
  console.log("Dokumen: docs/DEV-WORKFLOW.md");
}

const [command, ...rest] = process.argv.slice(2);
if (!command || command === "help" || command === "-h" || command === "--help") {
  help();
} else if (COMMANDS[command]) {
  try {
    await COMMANDS[command].run(rest);
  } catch (error) {
    die(error instanceof Error ? error.message : String(error));
  }
} else {
  console.error(red(`perintah tidak dikenal: ${command}\n`));
  help();
  process.exit(2);
}
