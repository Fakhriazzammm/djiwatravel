import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { springIos, springSnappy } from "@/lib/motion";
import type { PoiCategoryId } from "@/lib/itinerary-map";

type Prompt = { id: string; ask: string; reply: string; run: () => void };

/**
 * The mascot "talks" to the traveler: a speech bubble cycles through friendly questions, and
 * tapping one acts on it (open the add form, show food or stations on the map) with a short reply.
 */
export function AgendaMascotBubble({
  hasItems,
  canExploreMap,
  onAdd,
  onExplore,
  onIdeas,
}: {
  hasItems: boolean;
  /** The category helper is on, so "find food/stations" can show something. */
  canExploreMap: boolean;
  onAdd: () => void;
  onExplore: (category: PoiCategoryId) => void;
  /** AI place ideas are on: the first question opens the ideas sheet instead of the add form. */
  onIdeas?: (() => void) | undefined;
}) {
  const reduceMotion = useReducedMotion();
  const prompts = useMemo<Prompt[]>(() => {
    const list: Prompt[] = onIdeas
      ? [
          {
            id: "ideas",
            ask: hasItems ? "Ke mana lagi ya?" : "Mau mulai dari mana ya?",
            reply: "Aku carikan ide tempatnya!",
            run: onIdeas,
          },
          {
            id: "add",
            ask: "Mau catat rencana sendiri?",
            reply: "Yuk catat rencananya!",
            run: onAdd,
          },
        ]
      : [
          {
            id: "add",
            ask: hasItems ? "Ke mana lagi ya?" : "Mau mulai dari mana ya?",
            reply: "Yuk catat rencananya!",
            run: onAdd,
          },
        ];
    if (canExploreMap) {
      list.push(
        {
          id: "food",
          ask: "Cari tempat makan enak?",
          reply: "Siap! Ini tempat makan di sekitar sini.",
          run: () => onExplore("food"),
        },
        {
          id: "station",
          ask: "Stasiun terdekat di mana?",
          reply: "Oke, stasiunnya aku tandai di peta.",
          run: () => onExplore("station"),
        },
        {
          id: "attraction",
          ask: "Ada tempat seru apa ya?",
          reply: "Nih, tempat seru yang bisa dikunjungi!",
          run: () => onExplore("attraction"),
        },
        {
          id: "hotel",
          ask: "Perlu cari penginapan?",
          reply: "Boleh! Hotelnya muncul di peta.",
          run: () => onExplore("hotel"),
        },
      );
    }
    return list;
  }, [hasItems, canExploreMap, onAdd, onExplore, onIdeas]);

  const [index, setIndex] = useState(0);
  const [reply, setReply] = useState<string | null>(null);
  const replyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const current = prompts[index % prompts.length]!;

  // Move to the next question every few seconds, unless the traveler is mid-conversation.
  useEffect(() => {
    if (reduceMotion || reply || prompts.length < 2) return;
    const timer = setTimeout(() => setIndex((value) => (value + 1) % prompts.length), 6500);
    return () => clearTimeout(timer);
  }, [index, reply, reduceMotion, prompts.length]);

  useEffect(() => () => clearTimeout(replyTimer.current), []);

  function tap() {
    current.run();
    setReply(current.reply);
    clearTimeout(replyTimer.current);
    replyTimer.current = setTimeout(() => {
      setReply(null);
      setIndex((value) => (value + 1) % prompts.length);
    }, 3200);
  }

  const text = reply ?? current.ask;
  return (
    <motion.button
      type="button"
      onClick={tap}
      initial={{ opacity: 0, scale: 0.6, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      whileTap={{ scale: 0.95 }}
      transition={{ ...springIos, delay: 0.5 }}
      aria-label={reply ? reply : `${current.ask} Ketuk untuk menjawab`}
      className="tap pointer-events-auto relative mb-1.5 max-w-[168px] rounded-2xl bg-surface px-2.5 py-1.5 text-left text-[11px] font-semibold leading-snug text-foreground shadow-md ring-1 ring-border/50"
      data-testid="agenda-mascot-bubble"
    >
      <motion.span
        key={text}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSnappy}
        className="block"
      >
        {text}
      </motion.span>

      <span
        aria-hidden="true"
        className="absolute -bottom-1 right-6 size-2.5 rotate-45 bg-surface ring-1 ring-border/50 [clip-path:polygon(100%_0,100%_100%,0_100%)]"
      />
    </motion.button>
  );
}
