import { useState } from "react";
import { toast } from "sonner";
import { useConsent } from "@/hooks/use-consent";
import { CONSENT_LABEL, type ConsentPurpose } from "@/lib/consent";

/**
 * Shown in place of an action that needs one consent (posting in Feeds, for example).
 * One tap turns it on right here, so the member is never sent away from what they were doing.
 */
export function ConsentGate({
  purpose,
  text,
  onGranted,
}: {
  purpose: ConsentPurpose;
  text: string;
  onGranted?: () => void;
}) {
  const { save } = useConsent();
  const [busy, setBusy] = useState(false);
  async function grant() {
    setBusy(true);
    try {
      await save({ [purpose]: true }, "just_in_time");
      toast.success(`“${CONSENT_LABEL[purpose]}” aktif. Bisa diubah di Profil › Privasi & data.`);
      onGranted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Belum bisa menyimpan pilihan.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-secondary p-3">
      <p className="min-w-0 flex-1 text-[12px] text-muted-foreground">{text}</p>
      <button
        type="button"
        onClick={() => void grant()}
        disabled={busy}
        className="tap min-h-9 shrink-0 rounded-xl bg-brand-red px-3 text-[13px] font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Menyimpan…" : "Aktifkan"}
      </button>
    </div>
  );
}
