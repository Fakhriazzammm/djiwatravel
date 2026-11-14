import { motion, useReducedMotion } from "motion/react";
import { UserCheck } from "lucide-react";
import type { ShareLinkSummary } from "@/lib/esim-share";
import { springIos } from "@/lib/motion";

const claimedAtLabel = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso))
    : null;

/**
 * "Claimed" only means the recipient saved the eSIM to their account. The eSIM counts as installed
 * when eSIM Access reports the profile downloaded onto a phone, so until then the owner is told
 * plainly that it is claimed but not installed (instead of a bare "Siap dipasang").
 */
export function OwnerShareNotice({ link }: { link: ShareLinkSummary }) {
  const reduce = Boolean(useReducedMotion());
  const when = claimedAtLabel(link.claimedAt);
  return (
    <motion.section
      initial={{ opacity: 0, y: reduce ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : springIos}
      role="status"
      data-testid="owner-share-notice"
      className="mt-2.5 flex items-start gap-3 rounded-2xl bg-surface p-3"
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-red-soft text-brand-red"
      >
        <UserCheck className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[14px] font-semibold">Sudah diklaim penerima, belum dipasang</p>
        <p className="mt-0.5 text-[12px] leading-5 text-muted-foreground">
          Penerima menyimpan eSIM ini ke akunnya{when ? ` pada ${when}` : ""}. eSIM baru terpasang
          setelah QR di-scan di HP-nya, dan statusnya berubah di sini otomatis.
        </p>
      </div>
    </motion.section>
  );
}
