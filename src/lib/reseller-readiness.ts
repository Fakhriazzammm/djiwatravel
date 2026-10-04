export type ReadinessItem = { name: string; ready: boolean; detail: string };

/** Safe operational checklist; never returns secret values. */
export function getResellerReadiness(env: NodeJS.ProcessEnv = process.env): ReadinessItem[] {
  return [
    { name: "eSIM Access credentials", ready: Boolean(env.ESIM_ACCESS_CODE && env.ESIM_ACCESS_SECRET_KEY), detail: "Server-side credential tersedia" },
    { name: "Profile encryption", ready: Boolean(env.ESIM_PROFILE_ENCRYPTION_KEY), detail: "AES-256-GCM key tersedia" },
    { name: "Customer auth", ready: Boolean(env.CUSTOMER_AUTH_SECRET && env.CUSTOMER_AUTH_SECRET.length >= 32), detail: "Session signing secret tersedia" },
    { name: "Payment API", ready: Boolean(env.MAYAR_API_KEY), detail: env.MAYAR_API_KEY ? "Mayar server-side key tersedia" : "MAYAR_API_KEY belum dikonfigurasi" },
    { name: "Payment webhook", ready: Boolean(env.PAYMENT_WEBHOOK_SECRET), detail: env.PAYMENT_WEBHOOK_SECRET ? "Webhook signing secret tersedia" : "Webhook payment belum dikonfigurasi" },
    { name: "Database", ready: Boolean(env.DATABASE_URL || (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)), detail: (env.DATABASE_URL || env.SUPABASE_URL) ? "Database connection tersedia" : "Supabase/Postgres belum dipilih" },
    { name: "Admin auth", ready: Boolean(env.ADMIN_AUTH_ISSUER && env.ADMIN_AUTH_AUDIENCE), detail: env.ADMIN_AUTH_ISSUER && env.ADMIN_AUTH_AUDIENCE ? "Admin session verifier tersedia" : "Admin auth issuer/audience belum dikonfigurasi" },
    { name: "Operations worker", ready: Boolean(env.ESIM_RECONCILIATION_WORKER_ENABLED === "true"), detail: env.ESIM_RECONCILIATION_WORKER_ENABLED === "true" ? "Worker enabled" : "Reconciliation worker belum diaktifkan" },
  ];
}

export function isResellerReady(env: NodeJS.ProcessEnv = process.env) { return getResellerReadiness(env).every((item) => item.ready); }
