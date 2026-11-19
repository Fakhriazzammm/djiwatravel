import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { TRUCK_SRC } from "@/components/shipping/shipping-ui";

const EXHAUST_DELAYS = [0, 0.24, 0.48];

export function ShippingHeroTruck() {
  const reduced = useReducedMotion();
  const [drive, setDrive] = useState(0);
  const [revving, setRevving] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function revEngine() {
    window.clearTimeout(timer.current);
    setDrive((previous) => previous + 1);
    setRevving(true);
    timer.current = window.setTimeout(() => setRevving(false), 2200);
  }

  const duration = drive === 0 ? 4.8 : 2.2;

  return (
    <>
      <div
        key={drive}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-5 h-16 overflow-hidden"
      >
        {/* The horizon moves more slowly than the roadside and lane markings. */}
        <motion.span
          className="absolute inset-y-0 left-0 w-[calc(100%+80px)] opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 40px 100%, var(--brand-red) 0 48%, transparent 49%)",
            backgroundSize: "80px 45px",
            backgroundPosition: "left bottom",
            backgroundRepeat: "repeat-x",
          }}
          animate={reduced ? {} : { x: [0, -80] }}
          transition={{ duration, ease: "linear" }}
        />
        <motion.span
          className="absolute inset-x-0 bottom-0 h-6 bg-brand-red-soft"
          style={{
            backgroundImage: "linear-gradient(90deg, currentColor 0 12px, transparent 12px 40px)",
            backgroundSize: "40px 2px",
            backgroundPosition: "0 8px",
            backgroundRepeat: "repeat-x",
          }}
          animate={reduced ? {} : { backgroundPositionX: ["0px", drive ? "-320px" : "-240px"] }}
          transition={{ duration, ease: "linear" }}
        />
      </div>

      <button
        type="button"
        onClick={revEngine}
        aria-label="Bunyikan klakson dan jalankan truk Travo"
        className="absolute -right-1 bottom-[21px] z-10 block h-[128px] w-[45%] max-w-[175px] select-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <motion.span
          key={drive}
          className="relative block size-full"
          animate={
            reduced
              ? {}
              : {
                  x: drive ? [-5, -11, 3, 0] : [-7, 1, -3, 0],
                  y: [0, -3, 0, -2, 0],
                  rotate: drive ? [0, -1, 0.5, 0] : [0, -0.5, 0],
                }
          }
          transition={{ duration, ease: "easeInOut" }}
        >
          {!reduced &&
            EXHAUST_DELAYS.map((delay) => (
              <motion.span
                key={delay}
                aria-hidden="true"
                className="absolute bottom-[26px] left-[10px] size-3 rounded-full bg-foreground/25 blur-[2px]"
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, 0.55, 0], scale: [0.4, 1.7], x: [0, -28], y: [0, -16] }}
                transition={{ duration: 0.85, repeat: drive ? 1 : 4, delay }}
              />
            ))}
          <img
            src={TRUCK_SRC}
            alt=""
            draggable={false}
            className="relative size-full object-contain object-right-bottom"
          />
        </motion.span>
        {revving && (
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
