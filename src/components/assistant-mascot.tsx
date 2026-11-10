import { useCallback, useEffect, useRef, useState } from "react";
import { TravoMemoryPanel } from "@/components/travo-memory";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { springIos } from "@/lib/motion";
import { ASSISTANT_NAME } from "@/lib/trip-assistant";

/** Generated with the mascot skill (Helipod, locked character); see ASSET-MANIFEST.md. */
export const MASCOT_PORTRAIT = "/assets/home-hero/mascot-ai-v1.png";
export const MASCOT_THINKING = "/assets/home-hero/mascot-ai-think-v1.png";

export type MascotMood = "idle" | "thinking" | "talking";

/**
 * The assistant's face. It floats while idle, tilts and bobs while thinking, nods in time with the
 * words while talking, and hops when tapped or when `cheer` changes (an applied proposal). Only
 * transform and opacity animate; with reduced motion it stays still. The photo is a circle
 * cropped on the face, so it reads as a profile picture even at 28px.
 */
export function AssistantMascot({
  size = 28,
  mood = "idle",
  cheer = 0,
  onPress,
  label = ASSISTANT_NAME,
  ring = true,
}: {
  size?: number;
  mood?: MascotMood;
  /** Change this number to make the mascot hop once (for example after Terapkan). */
  cheer?: number;
  onPress?: () => void;
  label?: string;
  ring?: boolean;
}) {
  const reduce = Boolean(useReducedMotion());
  const controls = useAnimationControls();
  const first = useRef(true);

  const hop = useCallback(() => {
    if (reduce) return;
    void controls.start({
      y: [0, -size * 0.3, 0, -size * 0.1, 0],
      rotate: [0, -10, 8, -3, 0],
      scale: [1, 1.12, 0.96, 1.03, 1],
      transition: { duration: 0.7, ease: "easeOut" },
    });
  }, [controls, reduce, size]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    hop();
  }, [cheer, hop]);

  const ambient = reduce
    ? {}
    : mood === "thinking"
      ? {
          rotate: [-5, 5, -5],
          y: [0, -1, 0],
          transition: { duration: 1.4, repeat: Infinity, ease: "easeInOut" as const },
        }
      : mood === "talking"
        ? {
            y: [0, -size * 0.07, 0],
            scale: [1, 1.05, 1],
            transition: { duration: 0.55, repeat: Infinity, ease: "easeInOut" as const },
          }
        : {
            y: [0, -size * 0.04, 0],
            rotate: [0, 1.5, 0, -1.5, 0],
            transition: { duration: 3.6, repeat: Infinity, ease: "easeInOut" as const },
          };

  const src = mood === "thinking" ? MASCOT_THINKING : MASCOT_PORTRAIT;
  // The picture is wider than the circle: scale it up and centre it on the face.
  const imgW = size * (mood === "thinking" ? 1.32 : 1.3);
  const face =
    mood === "thinking"
      ? { x: 0.52, y: 0.36, ratio: 360 / 327 }
      : { x: 0.5, y: 0.37, ratio: 308 / 343 };
  const imgH = imgW * face.ratio;

  const body = (
    <motion.span animate={ambient} className="block" style={{ width: size, height: size }}>
      <motion.span
        animate={controls}
        {...(reduce ? {} : { whileTap: { scale: 0.88 } })}
        className={`relative block overflow-hidden rounded-full bg-brand-red-soft ${ring ? "ring-1 ring-brand-red/25" : ""}`}
        style={{ width: size, height: size }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.img
            key={src}
            src={src}
            alt=""
            draggable={false}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={springIos}
            className="pointer-events-none absolute max-w-none select-none"
            style={{
              width: imgW,
              height: imgH,
              left: size / 2 - face.x * imgW,
              top: size / 2 - face.y * imgH,
            }}
          />
        </AnimatePresence>
      </motion.span>
    </motion.span>
  );

  if (!onPress)
    return (
      <span aria-hidden="true" className="inline-block shrink-0">
        {body}
      </span>
    );
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => {
        hop();
        onPress();
      }}
      className="inline-block shrink-0 rounded-full"
    >
      {body}
    </button>
  );
}

const CHATTER = [
  "Halo! Aku Travo. Mau ke mana hari ini?",
  "Aku bisa bikin itinerary dalam hitungan detik.",
  "Bagi anggaran? Serahkan padaku.",
  "Jangan lupa cek checklist ya!",
  "Aku cek jam buka tempatnya juga, lho.",
  "Pssst, struk belanja bisa difoto langsung.",
];

const CHATTER_GENERAL = [
  "Halo! Aku Travo. Mau ke mana hari ini?",
  "Cari eSIM, tiket, atau titip belanja? Bilang saja.",
  "Aku bisa bantu beli eSIM langsung di sini.",
  "Cek saldo dan top up Djiwa Pay juga bisa.",
  "Mau bikin trip baru? Sebut tujuan dan tanggalnya.",
  "Pssst, tanya soal visa atau tax refund juga boleh.",
];

const SKILLS_GENERAL = [
  "Mencari dan membeli eSIM, lengkap dengan pemasangan QR",
  "Mencari harga tiket pesawat termurah",
  "Membuat trip, itinerary, anggaran, dan checklist",
  "Titip belanja dari Jepang, Korea, Thailand, dan Singapura",
  "Cek pesanan, saldo Djiwa Pay, dan top up",
  "Menjawab soal visa, tax refund, dan tips perjalanan",
];

const SKILLS = [
  "Menyusun itinerary per hari dan menaruhnya di peta",
  "Merapikan agenda yang bentrok atau tutup",
  "Membagi anggaran per kategori",
  "Menambah checklist yang terlewat",
  "Mencatat biaya dari satu kalimat atau foto struk",
];

/**
 * The assistant's profile: a big mascot that follows your finger a little, answers taps with a
 * hop and a line, plus what it can do and how many messages are left today.
 */
export function AssistantProfileSheet({
  open,
  onOpenChange,
  mood,
  remaining,
  dailyLimit,
  guest,
  onReset,
  hasConversation,
  variant = "trip",
}: {
  /** "general" is the standalone Travo page: every feature of the app, not only one trip. */
  variant?: "trip" | "general";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mood: MascotMood;
  remaining: number | null;
  dailyLimit?: number | undefined;
  guest: boolean;
  onReset: () => void;
  hasConversation: boolean;
}) {
  const reduce = Boolean(useReducedMotion());
  const chatter = variant === "general" ? CHATTER_GENERAL : CHATTER;
  const skills = variant === "general" ? SKILLS_GENERAL : SKILLS;
  const [line, setLine] = useState(0);
  const [taps, setTaps] = useState(0);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const stage = useRef<HTMLDivElement | null>(null);

  const follow = (clientX: number, clientY: number) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box || reduce) return;
    const dx = (clientX - (box.left + box.width / 2)) / box.width;
    const dy = (clientY - (box.top + box.height / 2)) / box.height;
    setTilt({ x: Math.max(-1, Math.min(1, dx)) * 10, y: Math.max(-1, Math.min(1, dy)) * -8 });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[24px] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-6"
      >
        <div
          className="mx-auto mb-2 h-1 w-9 rounded-full bg-muted-foreground/25"
          aria-hidden="true"
        />
        <SheetHeader className="text-center">
          <SheetTitle className="text-[17px]">{ASSISTANT_NAME}</SheetTitle>
          <SheetDescription className="text-[12px]">
            {variant === "general"
              ? "Asisten AI semua fitur Djiwa Travel · maskot pesawat"
              : "Asisten perjalanan berbasis AI · maskot pesawat Djiwa Travel"}
          </SheetDescription>
        </SheetHeader>

        <div
          ref={stage}
          className="relative mx-auto mt-3 grid h-44 w-full place-items-center"
          onPointerMove={(e) => follow(e.clientX, e.clientY)}
          onPointerLeave={() => setTilt({ x: 0, y: 0 })}
        >
          <AnimatePresence mode="popLayout">
            <motion.p
              key={line}
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4 }}
              transition={springIos}
              className="absolute top-0 max-w-[85%] rounded-2xl rounded-bl-md bg-surface px-3 py-1.5 text-center text-[12px] font-medium ring-1 ring-border/50"
            >
              {chatter[line % chatter.length]}
            </motion.p>
          </AnimatePresence>
          <motion.div
            animate={{ rotateY: tilt.x, rotateX: tilt.y }}
            transition={{ type: "spring", stiffness: 160, damping: 14 }}
            style={{ perspective: 400 }}
            className="mt-4"
          >
            <AssistantMascot
              size={112}
              mood={mood}
              cheer={taps}
              label="Sentuh maskot"
              onPress={() => {
                setTaps((n) => n + 1);
                setLine((n) => n + 1);
              }}
            />
          </motion.div>
        </div>

        <p className="mt-2 text-center text-[11px] text-muted-foreground" aria-live="polite">
          {mood === "thinking"
            ? "Sedang berpikir…"
            : mood === "talking"
              ? "Sedang menjawab…"
              : "Siap membantu"}
        </p>

        <ul className="mt-3 space-y-1.5 rounded-2xl bg-surface p-3 text-[13px] ring-1 ring-border/40">
          {skills.map((skill) => (
            <li key={skill} className="flex gap-2">
              <span
                className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-red"
                aria-hidden="true"
              />
              {skill}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {guest ? "Mode tamu · " : ""}
          {remaining !== null
            ? `Sisa ${remaining}${dailyLimit ? ` dari ${dailyLimit}` : ""} pesan hari ini`
            : ""}
        </p>
        <p className="mt-1 text-center text-[11px] text-muted-foreground">
          {variant === "general"
            ? "AI bisa keliru. Harga dan paket diambil langsung dari katalog; cek lagi sebelum membayar."
            : "AI bisa keliru. Usulan baru tersimpan setelah kamu menekan Terapkan."}
        </p>
        {!guest && <TravoMemoryPanel />}
        {hasConversation && (
          <button
            type="button"
            onClick={onReset}
            className="tap mt-3 min-h-10 w-full rounded-xl bg-secondary px-4 text-[13px] font-semibold"
          >
            Mulai obrolan baru
          </button>
        )}
      </SheetContent>
    </Sheet>
  );
}
