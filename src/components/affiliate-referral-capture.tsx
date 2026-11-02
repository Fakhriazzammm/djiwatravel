import { useEffect } from "react";
import { AFFILIATE_COOKIE, normalizeAffiliateCode } from "@/lib/affiliate";
import { claimAffiliateReferral, trackAffiliateClick } from "@/lib/affiliate.fn";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";

function readCookie(): string | null {
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${AFFILIATE_COOKIE}=`));
  return normalizeAffiliateCode(match ? decodeURIComponent(match.split("=")[1] ?? "") : "");
}

function writeCookie(code: string, days: number) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${AFFILIATE_COOKIE}=${encodeURIComponent(code)}; Max-Age=${days * 86400}; Path=/; SameSite=Lax${secure}`;
}

function clearCookie() {
  document.cookie = `${AFFILIATE_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

/**
 * Stores a `?ref=CODE` landing as a first-party cookie (only when the code is a real, active
 * affiliate), then, once the customer is signed in, asks the server to lock the referral. The
 * server derives the referee from the verified session; this component never supplies an owner.
 */
export function AffiliateReferralCapture() {
  const { user, loading } = useBetterAuthUser();

  useEffect(() => {
    const code = normalizeAffiliateCode(new URLSearchParams(window.location.search).get("ref"));
    if (!code || readCookie()) return;
    void trackAffiliateClick({ data: { code, path: window.location.pathname } })
      .then((result) => {
        if (result.valid) writeCookie(code, "cookieDays" in result ? result.cookieDays : 30);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    const code = readCookie();
    if (!code) return;
    void claimAffiliateReferral({ data: { code } })
      .then((result) => {
        // A network failure keeps the cookie for a retry; any server verdict is final.
        if (result.status !== "signed_out") clearCookie();
      })
      .catch(() => undefined);
  }, [user, loading]);

  return null;
}
