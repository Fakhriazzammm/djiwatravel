import { createServerFn } from "@tanstack/react-start";

// RPC declarations stay visible to the client compiler; implementations are server-only.
const passthrough = (data: unknown) => data;

export const trackAffiliateClick = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { trackAffiliateClickHandler } = await import("./affiliate.server");
    return trackAffiliateClickHandler({ data });
  });

export const claimAffiliateReferral = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { claimAffiliateReferralHandler } = await import("./affiliate.server");
    return claimAffiliateReferralHandler({ data });
  });

export const getAffiliateDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const { getAffiliateDashboardHandler } = await import("./affiliate.server");
  return getAffiliateDashboardHandler();
});

export const activateAffiliate = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { activateAffiliateHandler } = await import("./affiliate.server");
    return activateAffiliateHandler({ data });
  });

export const changeAffiliateCode = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { changeAffiliateCodeHandler } = await import("./affiliate.server");
    return changeAffiliateCodeHandler({ data });
  });

export const requestAffiliatePayout = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { requestAffiliatePayoutHandler } = await import("./affiliate.server");
    return requestAffiliatePayoutHandler({ data });
  });

export const getAdminAffiliates = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminAffiliatesHandler } = await import("./affiliate.server");
  return getAdminAffiliatesHandler();
});

export const mutateAdminAffiliate = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { mutateAdminAffiliateHandler } = await import("./affiliate.server");
    return mutateAdminAffiliateHandler({ data });
  });

export const saveAdminAffiliateConfig = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { saveAffiliateConfigHandler } = await import("./affiliate.server");
    return saveAffiliateConfigHandler({ data });
  });
