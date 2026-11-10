import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { springSnappy } from "@/lib/motion";

export type SwipeAction = {
  key: string;
  label: string;
  icon: ReactNode;
  /** Tailwind classes for the action background. */
  className: string;
  onClick: () => void;
};

const ACTION_W = 76;
const HINT_KEY = "djiwa:swipe-hint-v1";
const HINT_MAX_PLAYS = 3;

const readHint = (key: string) => {
  try {
    return Number(window.localStorage.getItem(key) ?? 0);
  } catch {
    return 0;
  }
};
const writeHint = (key: string, value: number) => {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* storage can be blocked; the hint then simply replays next visit */
  }
};

/**
 * Whether the "you can swipe these cards" teaser should still play. It plays on the first
 * ticket for the first few visits and stops for good once the traveler swipes a card.
 */
export function useSwipeHint(key = HINT_KEY) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const plays = readHint(key);
    if (plays < HINT_MAX_PLAYS) {
      setActive(true);
      writeHint(key, plays + 1);
    }
  }, [key]);
  const dismiss = useCallback(() => {
    setActive(false);
    writeHint(key, HINT_MAX_PLAYS);
  }, [key]);
  return { active, dismiss };
}

/**
 * Wraps a ticket so it can be swiped like an iOS list row: left reveals `rightActions`
 * (e.g. Arsip, Hapus), right reveals `leftActions` (e.g. Bagikan). `hint` plays a short peek
 * animation so people discover the gesture. A tap on an open row closes it instead of
 * opening the trip.
 */
export function SwipeableTicket({
  children,
  leftActions = [],
  rightActions = [],
  isOpen,
  onOpen,
  onClose,
  hint = false,
  onUsed,
}: {
  children: ReactNode;
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  /** True while this row is the one that is swiped open. */
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  hint?: boolean;
  onUsed?: () => void;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const moved = useRef(false);
  const hinting = useRef<ReturnType<typeof animate> | null>(null);
  const leftW = leftActions.length * ACTION_W;
  const rightW = rightActions.length * ACTION_W;
  const leftOpacity = useTransform(x, [0, 12], [0, 1]);
  const rightOpacity = useTransform(x, [0, -12], [0, 1]);

  useEffect(() => {
    if (!isOpen && x.get() !== 0) animate(x, 0, springSnappy);
  }, [isOpen, x]);

  // Teaser: peek left (Arsip/Hapus), then right (Bagikan), then rest.
  useEffect(() => {
    if (!hint || reduce || (!leftW && !rightW)) return;
    const timer = window.setTimeout(() => {
      const peekR = -Math.min(rightW, 64);
      const peekL = Math.min(leftW, 52);
      hinting.current = animate(x, [0, peekR, peekR, 0, peekL, peekL, 0], {
        duration: 2.6,
        ease: "easeInOut",
        times: [0, 0.18, 0.4, 0.55, 0.7, 0.82, 1],
      });
    }, 1400);
    return () => {
      window.clearTimeout(timer);
      hinting.current?.stop();
    };
  }, [hint, reduce, leftW, rightW, x]);

  const settle = (target: number) => {
    animate(x, target, springSnappy);
    if (target === 0) onClose();
    else onOpen();
  };

  return (
    <div
      className="relative"
      onClickCapture={(event) => {
        // A drag or an open row must not navigate into the trip.
        if (moved.current || x.get() !== 0) {
          event.preventDefault();
          event.stopPropagation();
          moved.current = false;
          if (x.get() !== 0) settle(0);
        }
      }}
    >
      {leftW > 0 && (
        <motion.div
          style={{ opacity: leftOpacity, width: leftW }}
          className="absolute inset-y-0 left-0 flex overflow-hidden rounded-l-2xl"
        >
          {leftActions.map((action) => (
            <ActionButton key={action.key} action={action} onDone={() => settle(0)} />
          ))}
        </motion.div>
      )}
      {rightW > 0 && (
        <motion.div
          style={{ opacity: rightOpacity, width: rightW }}
          className="absolute inset-y-0 right-0 flex overflow-hidden rounded-r-2xl"
        >
          {rightActions.map((action) => (
            <ActionButton key={action.key} action={action} onDone={() => settle(0)} />
          ))}
        </motion.div>
      )}
      <motion.div
        style={{ x, touchAction: "pan-y" }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -rightW, right: leftW }}
        dragElastic={0.12}
        dragMomentum={false}
        onPointerDown={() => hinting.current?.stop()}
        onDragStart={() => {
          moved.current = true;
          hinting.current?.stop();
          onUsed?.();
        }}
        onDragEnd={(_, info) => {
          const current = x.get();
          const fling = info.velocity.x;
          let target = 0;
          if (current < -ACTION_W * 0.4 || fling < -400) target = -rightW;
          else if (current > ACTION_W * 0.4 || fling > 400) target = leftW;
          if (current < 0 && fling > 400) target = 0;
          if (current > 0 && fling < -400) target = 0;
          settle(target);
          window.setTimeout(() => {
            moved.current = false;
          }, 60);
        }}
        className="relative"
      >
        {children}
      </motion.div>
    </div>
  );
}

function ActionButton({ action, onDone }: { action: SwipeAction; onDone: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        onDone();
        action.onClick();
      }}
      className={`tap flex h-full flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold text-white ${action.className}`}
      style={{ minWidth: ACTION_W }}
    >
      {action.icon}
      {action.label}
    </button>
  );
}
