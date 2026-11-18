import { useState } from "react";
import { toast } from "sonner";

/** Runs a document download and turns a failure into a toast, so a button never fails silently. */
export function usePrintAction() {
  const [busy, setBusy] = useState<string | null>(null);
  async function run(key: string, task: () => Promise<unknown>) {
    setBusy(key);
    try {
      await task();
    } catch {
      toast.error("Dokumen belum bisa dibuat di perangkat ini. Coba lagi.");
    } finally {
      setBusy(null);
    }
  }
  return { busy, run };
}
