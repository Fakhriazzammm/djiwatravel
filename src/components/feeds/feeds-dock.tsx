import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, Home, Newspaper, Search, User } from "lucide-react";
import { FixedLayer } from "@/components/motion-primitives";
import { Page } from "@/components/shell";
import { requestSearchFocus } from "@/components/feeds/feeds-search-focus";
import { useFeedsUnread } from "@/hooks/use-feeds-unread";

export const FEEDS_REFRESH_EVENT = "djiwa:feeds-refresh";
export const FEEDS_SEARCH_EVENT = "djiwa:feeds-search";

const items = [
  { id: "home", to: "/", label: "Beranda", icon: Home },
  { id: "feeds", to: "/explore", label: "Feeds", icon: Newspaper },
  { id: "cari", to: "/explore", label: "Cari", icon: Search },
  { id: "aktivitas", to: "/feeds/aktivitas", label: "Aktivitas", icon: Bell },
  { id: "aku", to: "/feeds/aku", label: "Aku", icon: User },
] as const;

/** Hides while the page scrolls down and comes back on the way up, so reading gets the whole screen. */
function useDockHidden() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 80) setHidden(false);
      else if (y > last + 8) setHidden(true);
      else if (y < last - 8) setHidden(false);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return hidden;
}

/**
 * The bottom bar of the Feeds area: a flat bar (not the floating pill of the rest of the app) with
 * Beranda to leave, Feeds (tap again to go to the top and refresh), Cari, Aktivitas and Aku.
 */
export function FeedsDock() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const unread = useFeedsUnread();
  const hidden = useDockHidden();
  const activeId =
    pathname === "/feeds/aktivitas"
      ? "aktivitas"
      : pathname === "/feeds/aku"
        ? "aku"
        : pathname === "/explore" || pathname.startsWith("/feeds")
          ? "feeds"
          : null;
  return (
    <nav
      aria-label="Navigasi Feeds"
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur transition-transform duration-300 motion-reduce:transition-none ${hidden ? "translate-y-full" : "translate-y-0"}`}
    >
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map(({ id, to, label, icon: Icon }) => {
          const active = id === activeId;
          const home = id === "home";
          return (
            <Link
              key={id}
              to={to}
              aria-current={active ? "page" : undefined}
              onClick={(event) => {
                if (id === "cari") {
                  if (pathname === "/explore") {
                    event.preventDefault();
                    window.dispatchEvent(new Event(FEEDS_SEARCH_EVENT));
                  } else {
                    requestSearchFocus();
                  }
                }
                if (id === "feeds" && pathname === "/explore") {
                  event.preventDefault();
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  window.dispatchEvent(new Event(FEEDS_REFRESH_EVENT));
                }
              }}
              className={`tap relative flex min-h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                home ? "text-brand-red" : active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              <span className="relative">
                <Icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.7} aria-hidden="true" />
                {id === "aktivitas" && unread > 0 && (
                  <span
                    role="status"
                    aria-label={`${unread} belum dibaca`}
                    className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-red px-1 text-[9px] font-bold text-white"
                  >
                    {unread >= 99 ? "99+" : unread}
                  </span>
                )}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** A Feeds page: the usual page container with the Feeds dock instead of the app tab bar. */
export function FeedsFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <Page tabs={false}>{children}</Page>
      <FixedLayer>
        <FeedsDock />
      </FixedLayer>
    </>
  );
}
