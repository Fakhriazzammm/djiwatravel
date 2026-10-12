import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { signInGoogle } from "@/lib/better-auth-client";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [{ title: "Admin login — Djiwa Travel" }, { name: "robots", content: "noindex" }],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <main className="flex min-h-screen items-center justify-center bg-[#f7f7f8] px-4">
      <section className="w-full max-w-md rounded-3xl border border-[#e5e5ea] bg-white p-7 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8a8a91]">Djiwa Travel</p>
        <h1 className="mt-3 text-2xl font-semibold text-[#18181b]">Admin login</h1>
        <p className="mt-2 text-sm leading-6 text-[#6b6b72]">
          Gunakan akun Google yang sudah terdaftar di allowlist admin. Akun traveler tidak mendapat
          akses admin.
        </p>
        <button
          type="button"
          onClick={() => void continueWithGoogle()}
          disabled={loading}
          className="mt-6 min-h-11 w-full rounded-xl bg-[#1f2d5c] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Menghubungkan…" : "Lanjutkan dengan Google"}
        </button>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <Link
          to="/profile"
          search={{ admin: undefined }}
          className="mt-5 block text-center text-sm font-semibold text-[#6b6b72]"
        >
          Kembali ke area traveler
        </Link>
      </section>
    </main>
  );
}
