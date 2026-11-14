import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Loader2, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { CustomerAuth } from "@/components/customer-auth";
import { EsimInstallPanel, ManualDetails } from "@/components/esim-install";
import { ClaimSteps } from "@/components/esim-share/claim-steps";
import { dateLabel, quotaLabel, splitQuantity } from "@/components/esim-share/share-format";
import { CheckDraw, Confetti, CountUp } from "@/components/esim-share/share-motion";
import { ShareMascot, type ShareMood } from "@/components/esim-share/share-mascot";
import { btnRed } from "@/components/shell";
import { destinations } from "@/lib/catalog";
import type { SharedEsimLanding, SharedEsimView } from "@/lib/esim-share";
import { springIos } from "@/lib/motion";

/** Flag and name for a country code; regional codes outside the catalogue keep a flag and the code. */
function region(code: string) {
  const upper = code.toUpperCase();
  const hit = destinations.find((d) => d.code.toUpperCase() === upper);
  if (hit) return { flag: hit.flag, label: hit.nameId };
  const flag = /^[A-Z]{2}$/.test(upper)
    ? String.fromCodePoint(...[...upper].map((ch) => 127397 + ch.charCodeAt(0)))
    : "🌏";
  return { flag, label: upper };
}

const PREVIEW_TIPS = [
  "Hai! Ada eSIM titipan untukmu. Klaim dulu ke akunmu, ya.",
  "Akun yang kamu pakai untuk masuk akan menyimpan akses eSIM ini. QR muncul setelah klaim berhasil.",
  "Pasang eSIM saat terhubung Wi-Fi, lalu aktifkan saat tiba di tujuan.",
] as const;

const openTips = (mode: SharedEsimView["claimMode"]) =>
  [
    mode === "account"
      ? "Akses eSIM ini tersimpan di akunmu. Buka link yang sama dari browser lain dengan akun yang sama."
      : "Link lama ini terikat ke browser ini, jadi pasang eSIM-nya di HP yang sedang kamu pakai.",
    "Pasang saat Wi-Fi aktif: Pengaturan › Seluler › Tambah eSIM, lalu scan QR di bawah.",
    "Sudah terpasang? Aktifkan eSIM dan data roaming saat kamu mendarat.",
  ] as const;

const list = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } };

function useItem() {
  const reduce = Boolean(useReducedMotion());
  return {
    reduce,
    item: {
      hidden: { opacity: reduce ? 1 : 0, y: reduce ? 0 : 8 },
      show: { opacity: 1, y: 0, transition: reduce ? { duration: 0 } : springIos },
    },
  };
}

function RegionChips({ codes }: { codes: string[] }) {
  const list = codes.length ? codes : [];
  if (!list.length)
    return <p className="mt-2 text-[12px] text-muted-foreground">Berlaku untuk wilayah regional</p>;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Wilayah berlaku">
      {list.map((code) => {
        const r = region(code);
        return (
          <li
            key={code}
            className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[12px] font-semibold"
          >
            <span aria-hidden="true">{r.flag}</span>
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}

/** A ticket edge: dashed tear line with half-circle notches on both sides. */
function TicketEdge() {
  return (
    <div className="relative -mx-4 my-3 h-4" aria-hidden="true">
      <span className="absolute inset-x-4 top-1/2 border-t border-dashed border-border" />
      <span className="absolute -left-2 top-0 size-4 rounded-full bg-background" />
      <span className="absolute -right-2 top-0 size-4 rounded-full bg-background" />
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  const parts = splitQuantity(value);
  return (
    <div className="rounded-xl bg-secondary/60 px-2 py-2.5 text-center">
      <small className="block text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </small>
      <b className="text-[15px] leading-tight">
        {parts ? (
          <>
            <CountUp value={parts.value} decimals={parts.decimals} />
            {parts.unit ? ` ${parts.unit}` : ""}
          </>
        ) : (
          value
        )}
      </b>
    </div>
  );
}

/** Opens and closes with a spring; the content stays in the DOM only while open. */
function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const reduce = Boolean(useReducedMotion());
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="tap flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {title}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: reduce ? 0 : 0.2 }}
        >
          <ChevronDown className="size-4" aria-hidden="true" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="pt-1">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Before the claim: a ticket with Travo, the package at a glance, the three steps and the claim button. */
export function ClaimPreviewCard({
  preview,
  signedIn,
  authLoading,
  claiming,
  error,
  onClaim,
}: {
  preview: Extract<SharedEsimLanding, { state: "available" }>["preview"];
  signedIn: boolean;
  authLoading: boolean;
  claiming: boolean;
  error: boolean;
  onClaim: () => void;
}) {
  const { reduce, item } = useItem();
  const spin = reduce ? "" : "animate-spin";
  return (
    <motion.section
      variants={list}
      initial="hidden"
      animate="show"
      className="overflow-hidden rounded-2xl bg-surface"
      data-testid="shared-esim-preview"
    >
      <div className="bg-gradient-to-b from-brand-red-soft to-surface px-4 pb-3 pt-4">
        <motion.span
          variants={item}
          className="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-red"
        >
          <Sparkles className="size-3.5" aria-hidden="true" /> eSIM khusus untukmu
        </motion.span>
        <motion.div variants={item} className="mt-3">
          <ShareMascot mood="wave" tips={PREVIEW_TIPS} />
        </motion.div>
      </div>

      <div className="px-4 pb-4">
        <motion.div variants={item}>
          <h1 className="text-[22px] font-bold leading-tight">{preview.packageName}</h1>
          <RegionChips codes={preview.locationCodes} />
        </motion.div>

        <TicketEdge />

        <motion.div variants={item} className="grid grid-cols-2 gap-2">
          <StatTile
            label="Durasi"
            value={preview.durationDays > 0 ? `${preview.durationDays} hari` : "Mengikuti paket"}
          />
          <StatTile label="Kuota" value={quotaLabel(preview.quotaBytes, preview.unlimited)} />
        </motion.div>

        <motion.div variants={item} className="mt-3">
          <ClaimSteps current={1} />
        </motion.div>

        <motion.div variants={item} className="mt-4">
          {authLoading ? (
            <button
              type="button"
              disabled
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-secondary text-[14px] font-semibold"
            >
              <Loader2 className={`size-4 ${spin}`} aria-hidden="true" /> Memeriksa akun…
            </button>
          ) : signedIn ? (
            <motion.button
              type="button"
              onClick={onClaim}
              disabled={claiming}
              {...(reduce ? {} : { whileTap: { scale: 0.97 } })}
              className={`${btnRed} relative w-full overflow-hidden`}
            >
              {!reduce && !claiming && (
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-y-0 -left-1/3 w-1/4 -skew-x-12 bg-white/25"
                  initial={{ x: "-120%" }}
                  animate={{ x: "520%" }}
                  transition={{ delay: 1.2, duration: 0.9, ease: "easeInOut" }}
                />
              )}
              {claiming ? (
                <Loader2 className={`size-5 ${spin}`} aria-hidden="true" />
              ) : (
                <Smartphone className="size-5" aria-hidden="true" />
              )}
              {claiming ? "Menyimpan ke akun…" : "Klaim eSIM ini"}
              {claiming && !reduce && (
                <motion.span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-white/60"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: [0, 0.7, 0.9] }}
                  transition={{ duration: 2.2, ease: "easeOut" }}
                />
              )}
            </motion.button>
          ) : (
            <CustomerAuth label="Masuk untuk klaim" />
          )}
        </motion.div>

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-brand-red-soft p-3 text-sm text-brand-red">
            eSIM belum bisa diklaim. Periksa koneksi lalu coba lagi.
          </p>
        )}
        <motion.p
          variants={item}
          className="mt-3 flex items-start gap-2 px-1 text-[12px] leading-5 text-muted-foreground"
        >
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          Pratinjau ini tidak menampilkan QR atau data pesanan. Setelah diklaim, akun yang sama bisa
          membuka link ini dari browser lain.
        </motion.p>
      </div>
    </motion.section>
  );
}

/** After the claim: the celebration, the install panel with the QR, the manual codes and the numbers. */
export function OpenEsimCard({
  view,
  justClaimed,
}: {
  view: SharedEsimView;
  justClaimed: boolean;
}) {
  const { reduce, item } = useItem();
  const expiry = dateLabel(view.expiresAtMs);
  const daysLeft =
    view.expiresAtMs === null ? null : Math.ceil((view.expiresAtMs - Date.now()) / 86_400_000);
  return (
    <motion.section
      variants={list}
      initial="hidden"
      animate="show"
      className="relative overflow-hidden rounded-2xl bg-surface"
      data-testid="shared-esim-open"
      aria-live="polite"
    >
      <div className="relative bg-gradient-to-b from-success/10 to-surface px-4 pb-3 pt-4">
        <Confetti run={justClaimed} />
        <div className="flex items-center gap-3">
          <CheckDraw />
          <div className="min-w-0">
            <h1 className="text-[20px] font-bold leading-tight">eSIM siap dipasang</h1>
            <p className="truncate text-[13px] text-muted-foreground">
              {view.packageName} · {view.locationCodes.join(" · ") || "Regional"}
            </p>
          </div>
        </div>
        <motion.div variants={item} className="mt-3">
          <ShareMascot mood="cheer" tips={openTips(view.claimMode)} celebrate={justClaimed} />
        </motion.div>
      </div>

      <div className="px-4 pb-4">
        <motion.div
          variants={item}
          className="flex items-center gap-2 rounded-xl bg-secondary/70 px-3 py-2.5"
          role="status"
        >
          <motion.span
            initial={{ scale: reduce ? 1 : 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 18, delay: reduce ? 0 : 0.5 }}
            className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-white"
          >
            <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
          </motion.span>
          <p className="text-[13px] font-semibold">
            {view.claimMode === "account" ? "Tersimpan di akunmu" : "Tersimpan di browser ini"}
          </p>
        </motion.div>
        <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
          {view.claimMode === "account"
            ? "Bisa dibuka kembali dengan akun yang sama dari browser lain."
            : "Link ini terikat ke browser ini. Minta pengirim membuat link baru untuk perangkat lain."}
        </p>

        <motion.div variants={item} className="mt-3">
          <ClaimSteps current={2} />
        </motion.div>

        <motion.div variants={item} className="mt-4">
          <EsimInstallPanel esim={{ ...view.esim, iccid: "" }} compact withGuide />
        </motion.div>

        <motion.div variants={item} className="mt-2">
          <Collapsible title="Atau masukkan manual">
            <ManualDetails esim={{ ...view.esim, iccid: "" }} />
          </Collapsible>
        </motion.div>

        <motion.div variants={item} className="mt-3 grid grid-cols-3 gap-2">
          <StatTile
            label="Durasi"
            value={view.durationDays > 0 ? `${view.durationDays} hari` : "Paket"}
          />
          <StatTile label="Kuota" value={quotaLabel(view.quotaBytes, view.unlimited)} />
          <StatTile label="Status" value={view.installed ? "Terpasang" : "Siap"} />
        </motion.div>
        {expiry && (
          <p className="mt-3 text-center text-[12px] text-muted-foreground">
            Berlaku sampai {expiry}
            {daysLeft !== null && daysLeft > 0 ? ` · ${daysLeft} hari lagi` : ""}
          </p>
        )}
      </div>
    </motion.section>
  );
}

/** The calm states (not available, claimed by someone else, check failed): Travo explains, never alarms. */
export function StateCard({
  title,
  detail,
  tips,
  mood = "think",
  children,
}: {
  title: string;
  detail: string;
  tips: readonly string[];
  mood?: ShareMood;
  children?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-surface">
      <div className="bg-gradient-to-b from-secondary/70 to-surface px-4 pb-3 pt-4">
        <ShareMascot mood={mood} tips={tips} />
      </div>
      <div className="px-4 pb-4">
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
        {children}
      </div>
    </section>
  );
}
