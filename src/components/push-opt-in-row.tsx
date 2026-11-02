import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { usePwaConfig } from "@/hooks/use-pwa";
import { disablePush, enablePush, pushSubscribed, pushSupported } from "@/lib/pwa-client";

/** Per-device push opt-in. Hidden when push is off in Admin, unconfigured on the server, or unsupported. */
export function PushOptInRow() {
  const { config, pushPublicKey } = usePwaConfig();
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupported(pushSupported());
    void pushSubscribed().then(setOn);
  }, []);

  if (!supported || !config.pushEnabled || !pushPublicKey) return null;

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      if (on) {
        await disablePush();
        setOn(false);
      } else {
        const ok = await enablePush(pushPublicKey);
        setOn(ok);
        if (!ok)
          setError("Notifikasi belum aktif. Pastikan kamu sudah masuk dan mengizinkan notifikasi.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={on}
        data-testid="push-opt-in-row"
        className="flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left text-[17px]"
      >
        <Bell className="size-5 text-primary" aria-hidden="true" />
        <span className="flex-1">Notifikasi eSIM & pesanan</span>
        <span className="text-sm font-medium text-primary">{on ? "Aktif" : "Aktifkan"}</span>
      </button>
      {error ? <p className="px-4 pb-3 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
