import { createServerFn } from "@tanstack/react-start";

// RPC declarations stay visible to the client compiler; implementations are server-only.
const passthrough = (data: unknown) => data;

export const getTemplatesStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { templatesStatusHandler } = await import("./trip-templates.server");
  return templatesStatusHandler().catch(() => ({ enabled: false, showTile: false }));
});

export const listTemplateGallery = createServerFn({ method: "GET" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { listTemplateGalleryHandler } = await import("./trip-templates.server");
    return listTemplateGalleryHandler({ data });
  });

export const getPublicTemplate = createServerFn({ method: "GET" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { getPublicTemplateHandler } = await import("./trip-templates.server");
    return getPublicTemplateHandler({ data });
  });

export const copyTemplate = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { copyTemplateHandler } = await import("./trip-templates.server");
    return copyTemplateHandler({ data });
  });

export const reportTemplate = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { reportTemplateHandler } = await import("./trip-templates.server");
    return reportTemplateHandler({ data });
  });

export const listMyTemplates = createServerFn({ method: "GET" }).handler(async () => {
  const { listMyTemplatesHandler } = await import("./trip-templates.server");
  return listMyTemplatesHandler();
});

export const publishTripTemplate = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { publishTripTemplateHandler } = await import("./trip-templates.server");
    return publishTripTemplateHandler({ data });
  });

export const publishDraftTemplate = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { publishDraftTemplateHandler } = await import("./trip-templates.server");
    return publishDraftTemplateHandler({ data });
  });

export const generateTemplateDraft = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { generateTemplateDraftHandler } = await import("./trip-templates.server");
    return generateTemplateDraftHandler({ data });
  });

export const updateTemplate = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { updateTemplateHandler } = await import("./trip-templates.server");
    return updateTemplateHandler({ data });
  });

export const refreshTemplate = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { refreshTemplateHandler } = await import("./trip-templates.server");
    return refreshTemplateHandler({ data });
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { deleteTemplateHandler } = await import("./trip-templates.server");
    return deleteTemplateHandler({ data });
  });

export const getAdminTemplates = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminTemplatesHandler } = await import("./trip-templates.server");
  return getAdminTemplatesHandler();
});

export const adminTemplateAction = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { adminTemplateActionHandler } = await import("./trip-templates.server");
    return adminTemplateActionHandler({ data });
  });

export const saveAdminTemplatesConfig = createServerFn({ method: "POST" })
  .validator(passthrough)
  .handler(async ({ data }) => {
    const { saveTemplatesConfigHandler } = await import("./trip-templates.server");
    return saveTemplatesConfigHandler({ data });
  });
