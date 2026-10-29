import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { signInGoogle } from "@/lib/better-auth-client";
import { ACTION_STAGES, useStagedLabel } from "@/lib/progress-stages";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [{ title: "Admin login — Djiwa Travel" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleLabel = useStagedLabel(loading, ACTION_STAGES.auth);

  async function continueWithGoogle() {
    setLoading(true);
    setError(null);
    try {
      await signInGoogle(`${window.location.origin}/admin/dashboard`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google Auth belum tersedia. Coba lagi.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <section className="w-full max-w-md rounded-3xl border border-border bg-surface p-7 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Djiwa Travel</p>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">Admin login</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Gunakan akun Google yang sudah terdaftar di allowlist admin. Akun traveler tidak mendapat
          akses admin.
        </p>
        <button
          type="button"
          onClick={() => void continueWithGoogle()}
          disabled={loading}
          className="mt-6 min-h-11 w-full rounded-xl bg-brand-red px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? googleLabel : "Lanjutkan dengan Google"}
        </button>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <Link
          to="/profile"
          search={{ admin: undefined }}
          className="mt-5 block text-center text-sm font-semibold text-muted-foreground"
        >
          Kembali ke area traveler
        </Link>
      </section>
    </main>
  );
}
