import { ADMIN_AUTH_ISSUER, ADMIN_INVITE_READINESS, adminEmails } from "@/lib/admin-guard.server";

export type ReadinessItem = {
  name: string;
  ready: boolean;
  detail: string;
  /** Owned by another system; shown for information, not counted as a blocker. */
  external?: boolean;
};

/** Safe operational checklist; never returns secret values. */
export function getResellerReadiness(env: NodeJS.ProcessEnv = process.env): ReadinessItem[] {
  return [
    {
      name: "eSIM Access credentials",
      ready: Boolean(env["ESIM_ACCESS_CODE"] && env["ESIM_ACCESS_SECRET_KEY"]),
      detail: "Server-side credential tersedia",
    },
    {
      name: "Profile encryption",
      ready: Boolean(env["ESIM_PROFILE_ENCRYPTION_KEY"]),
      detail: "AES-256-GCM key tersedia",
    },
    {
      name: "Djiwa Pay wallet",
      ready: Boolean(env["DJIWA_TRAVEL_WALLET_PAYMENT_SECRET"]?.trim()),
      detail: env["DJIWA_TRAVEL_WALLET_PAYMENT_SECRET"]?.trim()
        ? "Wallet payment secret tersedia"
        : "DJIWA_TRAVEL_WALLET_PAYMENT_SECRET belum dikonfigurasi",
    },
    {
      name: "Payment API",
      ready: Boolean(env["MAYAR_API_KEY"]),
      detail: env["MAYAR_API_KEY"]
        ? "Mayar server-side key tersedia"
        : "MAYAR_API_KEY belum dikonfigurasi",
    },
    {
      name: "Payment webhook",
      ready: Boolean(env["DJIWA_TRAVEL_CALLBACK_SECRET"]?.trim()),
      detail: env["DJIWA_TRAVEL_CALLBACK_SECRET"]?.trim()
        ? "Callback signing secret tersedia"
        : "DJIWA_TRAVEL_CALLBACK_SECRET belum dikonfigurasi",
    },
    {
      name: "Database",
      ready: Boolean(
        env["DATABASE_URL"] || (env["SUPABASE_URL"] && env["SUPABASE_SERVICE_ROLE_KEY"]),
      ),
      detail:
        env["DATABASE_URL"] || env["SUPABASE_URL"]
          ? "Database connection tersedia"
          : "Supabase/Postgres belum dipilih",
    },
    {
      name: "Admin auth",
      ready: adminEmails(env).length > 0,
      detail:
        adminEmails(env).length > 0
          ? `Allowlist aktif; session diverifikasi oleh ${ADMIN_AUTH_ISSUER}`
          : "ADMIN_EMAILS belum dikonfigurasi; session verifier fail-closed",
    },
    {
      name: "Admin Google provider",
      ready: true,
      external: true,
      detail:
        "Dikelola Better Auth pusat (api.djiwatentram.web.id); tidak dikonfigurasi di runtime ini",
    },
    {
      name: "Admin invites",
      ready: false,
      external: true,
      detail: ADMIN_INVITE_READINESS.reason,
    },
    {
      name: "Operations worker",
      ready: Boolean(env["ESIM_SYNC_TASK_SECRET"]?.trim()),
      detail: env["ESIM_SYNC_TASK_SECRET"]?.trim()
        ? "Task secret eSIM sync tersedia"
        : "ESIM_SYNC_TASK_SECRET belum dikonfigurasi; /api/tasks/esim-sync ditolak",
    },
  ];
}

export function isResellerReady(env: NodeJS.ProcessEnv = process.env) {
  return getResellerReadiness(env).every((item) => item.ready || item.external);
}
