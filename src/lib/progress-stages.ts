import { useEffect, useRef, useState } from "react";

/**
 * Staged progress copy for long-running async actions.
 *
 * A single fixed label ("Memuat…", "Menyiapkan…") tells the customer nothing about whether the app
 * is still working: fast operations flash the wrong text and slow ones look frozen. Callers pass the
 * stages their own operation actually goes through, and this hook advances through them by elapsed
 * time so the label reflects real progress.
 *
 * The last stage is sticky: an operation that outlives the copy stays on the most informative
 * message instead of looping back to "starting".
 */
export function useStagedLabel(active: boolean, stages: readonly string[], stepMs = 1_400): string {
  const [index, setIndex] = useState(0);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    startedAt.current = Date.now();
    setIndex(0);
    if (stages.length <= 1) return;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      const next = Math.min(Math.floor(elapsed / stepMs), stages.length - 1);
      setIndex(next);
    }, stepMs);
    return () => window.clearInterval(timer);
  }, [active, stages, stepMs]);

  return stages[Math.min(index, stages.length - 1)] ?? "";
}

/** Progress copy for the shared "working…" phases, so screens do not invent their own wording. */
export const ACTION_STAGES = {
  auth: ["Menghubungkan…", "Membuka Google…", "Menyiapkan akun…"],
  search: ["Mencari paket…", "Membandingkan harga…", "Menyusun rekomendasi…"],
  walletLoad: ["Memuat Wallet…", "Menyinkronkan saldo…", "Menyiapkan riwayat…"],
  profileSave: ["Menyimpan…", "Menyinkronkan profil…"],
  receiptExport: ["Menyiapkan PDF…", "Menyusun halaman…", "Menyelesaikan berkas…"],
  paymentCheck: ["Memeriksa pembayaran…", "Menghubungi penyedia…", "Menyinkronkan status…"],
} as const;
