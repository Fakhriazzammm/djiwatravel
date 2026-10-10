import { useEffect, useState } from "react";
import { getBetterAuthSession, type BetterAuthUser } from "./better-auth-client";

/**
 * Reads the Better Auth session once on mount so a returning customer is
 * recognised on every page.
 *
 * The read happens in an effect on purpose: it must never run during SSR, where
 * the server request carries no customer cookie and would report a signed-out
 * user. Both the server render and the first client render therefore start from
 * `loading: true, user: null`, which keeps hydration stable; callers should keep
 * their signed-out UI hidden while `loading` is true so a logged-in customer
 * never sees a login prompt flash.
 */
export function useBetterAuthUser() {
  const [user, setUser] = useState<BetterAuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    getBetterAuthSession()
      .then((session) => {
        if (active) setUser(session?.user ?? null);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return { user, setUser, loading };
}
