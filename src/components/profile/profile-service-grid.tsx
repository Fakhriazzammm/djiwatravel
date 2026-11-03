import { ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion } from "motion/react";
import { springIos } from "@/lib/motion";

const art = (name: string) => `/assets/profile/profile-${name}-v2.jpg`;

export type ProfileTile = {
  id: "esim" | "trips" | "wallet" | "orders" | "notifications" | "support" | "guides" | "calendar";
  label: string;
  /** Short, real value (count/state). Never invented. */
  detail: string;
  /** Red count badge (unread notifications). */
  badge?: number;
  tone?: "ok";
};

const IMAGE: Record<ProfileTile["id"], string> = {
  esim: "/assets/explore/services/esim.svg",
  trips: art("trips"),
  wallet: art("wallet"),
  orders: art("orders"),
  notifications: art("bell"),
  support: art("support"),
  guides: art("guides"),
  calendar: art("calendar"),
};

const tileClass =
  "tap relative flex min-h-[104px] flex-col items-center rounded-2xl px-0.5 pb-2.5 pt-1.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function TileBody({ tile }: { tile: ProfileTile }) {
  return (
    <>
      <img
        src={IMAGE[tile.id]}
        alt=""
        width={54}
        height={54}
        loading="lazy"
        decoding="async"
        className="size-[54px] object-contain mix-blend-multiply"
      />
      <span className="mt-1.5 text-[11px] font-semibold leading-tight">{tile.label}</span>
      <span
        className={`mt-0.5 line-clamp-1 text-[10px] ${tile.tone === "ok" ? "text-success" : "text-muted-foreground"}`}
      >
        {tile.detail}
      </span>
      {tile.badge ? (
        <span
          className="absolute right-2 top-0 grid h-[19px] min-w-[19px] place-items-center rounded-full bg-[#ff3b30] px-1 text-[12px] font-semibold text-white ring-2 ring-surface"
          aria-label={`${tile.badge} belum dibaca`}
        >
          {tile.badge > 99 ? "99+" : tile.badge}
        </span>
      ) : null}
    </>
  );
}

/** iOS-style grid of the customer's own data areas. Every tile is a labelled 44px+ control. */
export function ProfileServiceGrid({
  tiles,
  onCalendar,
}: {
  tiles: ProfileTile[];
  onCalendar: () => void;
}) {
  const reduce = useReducedMotion();
  const to = {
    esim: "/my-esim",
    trips: "/my-trips",
    wallet: "/wallet",
    orders: "/my-orders",
    notifications: "/notifications",
    support: "/support",
    guides: "/panduan",
  } as const;
  return (
    <div className="grid grid-cols-4 gap-0.5 px-1.5 py-3" role="list">
      {tiles.map((tile, index) => (
        <motion.div
          key={tile.id}
          role="listitem"
          initial={reduce ? false : { opacity: 0, y: 10, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={reduce ? { duration: 0 } : { ...springIos, delay: index * 0.03 }}
        >
          {tile.id === "calendar" ? (
            <button
              type="button"
              onClick={onCalendar}
              className={`${tileClass} w-full`}
              aria-label={`${tile.label}: ${tile.detail}`}
            >
              <TileBody tile={tile} />
            </button>
          ) : (
            <Link
              to={to[tile.id]}
              className={tileClass}
              aria-label={`${tile.label}: ${tile.detail}`}
            >
              <TileBody tile={tile} />
            </Link>
          )}
        </motion.div>
      ))}
    </div>
  );
}

export function RowChevron() {
  return <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />;
}
