import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { TRUCK_SRC } from "@/components/shipping/shipping-ui";

const LANDSCAPE_SRC = "/assets/explore/services/shipping-japan-landscape-v1.jpg";
// A, B(mirrored), A, B: shifting by exactly half the strip (two tiles) lands on an identical
// frame, so the scroll loops with no seam.
const LANDSCAPE_TILES = [false, true, false, true];
const SMOKE = [0, 0.28, 0.56, 0.84];
const LINES = [30, 52, 74];

const CRUISE = 2.2; // landscape strip percent per second
const RUSH = 9;

/**
 * The delivery scene behind the Kirim Barang hero: the landscape scrolls forever (far layer),
 * the road streams faster (near layer), the truck rides on its suspension with a shadow, exhaust
 * puffs and speed lines never stop. Tapping the truck honks and pushes it to a rush that eases
 * back to cruising speed. One speed value drives every layer, so they always agree.
 */
export function ShippingHeroTruck() {
  const reduced = useReducedMotion();
  const [rush, setRush] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const speed = useRef(CRUISE);
  const target = useRef(CRUISE);
  const pos = useMotionValue(0);
  const landscapeX = useTransform(pos, (v) => `${-(v % 50)}%`);
  const roadX = useTransform(pos, (v) => `${-((v * 36) % 40)}px 8px`);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useAnimationFrame((_, delta) => {
    if (reduced) return;
    const dt = Math.min(delta, 64) / 1000;
    // Ease toward the target speed (accelerate quickly, settle gently).
    speed.current += (target.current - speed.current) * Math.min(1, dt * (rush ? 5 : 1.6));
    pos.set(pos.get() + speed.current * dt);
  });

  const honk = () => {
    window.clearTimeout(timer.current);
    target.current = RUSH;
    setRush(true);
    try {
      navigator.vibrate?.(12);
    } catch {
      /* optional */
    }
    timer.current = window.setTimeout(() => {
      target.current = CRUISE;
      setRush(false);
    }, 2400);
  };

  const bounce = rush ? 0.38 : 0.85;

  return (
    <>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute inset-y-0 left-0 flex w-[400%] opacity-80"
          style={{ x: landscapeX }}
        >
          {LANDSCAPE_TILES.map((mirrored, index) => (
            <img
              key={index}
              src={LANDSCAPE_SRC}
              alt=""
              draggable={false}
              className="h-full w-1/4 shrink-0 object-cover object-[center_62%]"
              style={mirrored ? { transform: "scaleX(-1)" } : undefined}
            />
          ))}
        </motion.div>
        <div className="absolute inset-0 bg-linear-to-r from-brand-red-soft via-brand-red-soft/80 to-transparent" />
      </div>

      {/* Road: dashes stream past at the same speed as everything else. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-5 h-6">
        <motion.span
          className="absolute inset-x-0 bottom-0 h-6 bg-brand-red-soft/80 text-brand-red/35"
          style={{
            backgroundImage: "linear-gradient(90deg, currentColor 0 14px, transparent 14px 40px)",
            backgroundSize: "40px 2px",
            backgroundRepeat: "repeat-x",
            backgroundPosition: roadX,
          }}
        />
      </div>

      {/* Speed lines: constant, longer and quicker while rushing. */}
      {!reduced && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          {LINES.map((top, i) => (
            <motion.span
              key={top}
              className="absolute right-[34%] h-[2px] rounded-full bg-foreground/20"
              style={{ top: `${top}%`, width: rush ? 46 : 26 }}
              animate={{ x: [0, -70], opacity: [0, 0.7, 0] }}
              transition={{
                duration: rush ? 0.5 : 1.3,
                repeat: Infinity,
                ease: "linear",
                delay: i * (rush ? 0.15 : 0.4),
              }}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={honk}
        aria-label="Bunyikan klakson dan jalankan truk Travo"
        className="absolute -right-1 bottom-[21px] z-10 block h-[128px] w-[45%] max-w-[175px] select-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {/* Shadow under the wheels breathes with the suspension. */}
        <motion.span
          aria-hidden="true"
          className="absolute bottom-[3px] left-[8%] h-[7px] w-[84%] rounded-[50%] bg-foreground/20 blur-[3px]"
          animate={reduced ? {} : { scaleX: [1, 0.94, 1], opacity: [0.9, 0.65, 0.9] }}
          transition={{ duration: bounce, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          className="relative block size-full origin-bottom"
          animate={
            reduced
              ? {}
              : {
                  y: [0, -2.2, 0, -1.2, 0],
                  rotate: rush ? [-1.2, 0.2, -1, 0.3, -1.2] : [0, -0.35, 0, -0.2, 0],
                  x: rush ? -6 : 0,
                }
          }
          transition={{
            y: { duration: bounce, repeat: Infinity, ease: "easeInOut" },
            rotate: { duration: bounce * 1.4, repeat: Infinity, ease: "easeInOut" },
            x: { type: "spring", stiffness: 120, damping: 14 },
          }}
        >
          {!reduced &&
            SMOKE.map((delay) => (
              <motion.span
                key={delay}
                aria-hidden="true"
                className="absolute bottom-[26px] left-[10px] size-3 rounded-full bg-foreground/25 blur-[2px]"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{
                  opacity: [0, rush ? 0.7 : 0.5, 0],
                  scale: [0.4, rush ? 2.6 : 1.8],
                  x: [0, rush ? -46 : -28],
                  y: [0, rush ? -22 : -16],
                }}
                transition={{
                  duration: rush ? 0.7 : 1.5,
                  repeat: Infinity,
                  ease: "easeOut",
                  delay: rush ? delay / 2 : delay,
                }}
              />
            ))}
          <img
            src={TRUCK_SRC}
            alt=""
            draggable={false}
            className="relative size-full object-contain object-right-bottom"
          />
        </motion.span>
        {rush && (
          <span
            role="status"
            className="absolute right-3 top-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-brand-red shadow-sm"
          >
            Tiin tiin!
          </span>
        )}
      </button>
    </>
  );
}
