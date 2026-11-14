import { createServerFn } from "@tanstack/react-start";

// RPC declarations. Ownership comes from the signed-in session inside consent.server.ts.

export const getMyConsent = createServerFn({ method: "GET" }).handler(async () => {
  const { getMyConsentHandler } = await import("./consent.server");
  return getMyConsentHandler();
});

export const saveMyConsent = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { saveConsentInput } = await import("./consent.server");
    return saveConsentInput(data);
  })
  .handler(async ({ data }) => {
    const { saveMyConsentHandler } = await import("./consent.server");
    return saveMyConsentHandler({ data });
  });

export const snoozeConsentPrompt = createServerFn({ method: "POST" }).handler(async () => {
  const { snoozeConsentPromptHandler } = await import("./consent.server");
  return snoozeConsentPromptHandler();
});

export const getAdminConsent = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminConsentHandler } = await import("./consent.server");
  return getAdminConsentHandler();
});
