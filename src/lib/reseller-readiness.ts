import { ADMIN_AUTH_ISSUER, ADMIN_INVITE_READINESS, adminEmails } from "@/lib/admin-guard.server";

export type ReadinessItem = { name: string; ready: boolean; detail: string };

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
      name: "Customer auth",
      ready: Boolean(env["CUSTOMER_AUTH_SECRET"] && env["CUSTOMER_AUTH_SECRET"].length >= 32),
      detail: "Session signing secret tersedia",
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
      ready: Boolean(env["PAYMENT_WEBHOOK_SECRET"]),
      detail: env["PAYMENT_WEBHOOK_SECRET"]
        ? "Webhook signing secret tersedia"
        : "Webhook payment belum dikonfigurasi",
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
      ready: Boolean(env["GOOGLE_CLIENT_ID"] && env["GOOGLE_CLIENT_SECRET"]),
      detail:
        env["GOOGLE_CLIENT_ID"] && env["GOOGLE_CLIENT_SECRET"]
          ? "Google provider dikonfigurasi pada runtime ini"
          : "Google provider dikelola canonical Better Auth; status runtime external belum terverifikasi",
    },
    {
      name: "Admin invites",
      ready: ADMIN_INVITE_READINESS.available,
      detail: ADMIN_INVITE_READINESS.reason,
    },
    {
      name: "Operations worker",
      ready: Boolean(env["ESIM_RECONCILIATION_WORKER_ENABLED"] === "true"),
      detail:
        env["ESIM_RECONCILIATION_WORKER_ENABLED"] === "true"
          ? "Worker enabled"
          : "Reconciliation worker belum diaktifkan",
    },
  ];
}

export function isResellerReady(env: NodeJS.ProcessEnv = process.env) {
  return getResellerReadiness(env).every((item) => item.ready);
}
