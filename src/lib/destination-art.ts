/**
 * One map from destination code to its pass artwork, shared by every surface that draws a
 * destination (Home passes and rail, eSIM list, destination header).
 *
 * `src` is the 3D pass asset once generated per the DESIGN.md asset contract
 * (`public/assets/esim/esim-pass-<code>-v1.webp`); a destination without one falls back to the flag
 * emoji and the soft tint below keeps each country recognisable.
 * Every tint is light: text on a pass must stay dark.
 */
export type DestinationArt = {
  /** Tailwind classes for a light gradient surface. */
  tint: string;
  src?: string;
};

const NEUTRAL: DestinationArt = {
  tint: "bg-[linear-gradient(160deg,#ffffff,#f4f5f8)]",
};

const TINTS: Record<string, DestinationArt> = {
  JP: {
    tint: "bg-[radial-gradient(110%_90%_at_100%_0%,#f9d9de_0,transparent_60%),linear-gradient(160deg,#fff,#fbf3f4)]",
  },
  KR: {
    tint: "bg-[radial-gradient(110%_90%_at_100%_0%,#d6ecf7_0,transparent_60%),linear-gradient(160deg,#fff,#f1f7fb)]",
  },
  TH: {
    tint: "bg-[radial-gradient(110%_90%_at_100%_0%,#e1dcf6_0,transparent_60%),linear-gradient(160deg,#fff,#f5f3fb)]",
  },
  SG: {
    tint: "bg-[radial-gradient(110%_90%_at_100%_0%,#fbe0d6_0,transparent_60%),linear-gradient(160deg,#fff,#fcf5f2)]",
  },
  SA: {
    tint: "bg-[radial-gradient(110%_90%_at_100%_0%,#d9efe0_0,transparent_60%),linear-gradient(160deg,#fff,#f2f9f4)]",
  },
  ASIA: {
    tint: "bg-[radial-gradient(110%_90%_at_100%_0%,#fdeccb_0,transparent_60%),linear-gradient(160deg,#fff,#fcf8ef)]",
  },
  GLOBAL: {
    tint: "bg-[radial-gradient(110%_90%_at_100%_0%,#d4e6fb_0,transparent_60%),linear-gradient(160deg,#fff,#f1f6fc)]",
  },
};

export function destinationArt(code: string | undefined | null): DestinationArt {
  if (!code) return NEUTRAL;
  const key = code.trim().toUpperCase();
  const entry = TINTS[key];
  // Every tinted destination ships a 3D pass named after its code.
  return entry ? { ...entry, src: `/assets/esim/esim-pass-${key.toLowerCase()}-v1.webp` } : NEUTRAL;
}

export type StateArtKind = "ready" | "pending" | "low";

const STATE_ART: Record<StateArtKind, string> = {
  ready: "/assets/esim/esim-state-ready-v1.webp",
  pending: "/assets/esim/esim-state-processing-v1.webp",
  low: "/assets/esim/esim-state-low-v1.webp",
};

/** Action states (install, in progress, low quota) draw attention with their own icon. */
export function stateArt(kind: string): string | undefined {
  return STATE_ART[kind as StateArtKind];
}
