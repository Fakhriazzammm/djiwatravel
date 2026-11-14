import { createServerFn } from "@tanstack/react-start";

// RPC declarations. Guards, ownership and database access stay in feeds.server.ts.
// Creating a post (with an optional photo) goes through POST /api/feeds-post (multipart).

export const getFeedsStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { getFeedsStatusHandler } = await import("./feeds.server");
  return getFeedsStatusHandler();
});

export const getFeed = createServerFn({ method: "GET" })
  .validator(async (data: unknown) => {
    const { feedListInput } = await import("./feeds.server");
    return feedListInput(data);
  })
  .handler(async ({ data }) => {
    const { listFeedHandler } = await import("./feeds.server");
    return listFeedHandler({ data });
  });

export const getFeedPost = createServerFn({ method: "GET" })
  .validator(async (data: unknown) => {
    const { feedIdInput } = await import("./feeds.server");
    return feedIdInput(data);
  })
  .handler(async ({ data }) => {
    const { getFeedPostHandler } = await import("./feeds.server");
    return getFeedPostHandler({ data });
  });

export const toggleFeedLike = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { feedIdInput } = await import("./feeds.server");
    return feedIdInput(data);
  })
  .handler(async ({ data }) => {
    const { toggleFeedLikeHandler } = await import("./feeds.server");
    return toggleFeedLikeHandler({ data });
  });

export const toggleFeedCommentLike = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { feedIdInput } = await import("./feeds.server");
    return feedIdInput(data);
  })
  .handler(async ({ data }) => {
    const { toggleFeedCommentLikeHandler } = await import("./feeds.server");
    return toggleFeedCommentLikeHandler({ data });
  });

export const addFeedComment = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { feedCommentInput } = await import("./feeds.server");
    return feedCommentInput(data);
  })
  .handler(async ({ data }) => {
    const { addFeedCommentHandler } = await import("./feeds.server");
    return addFeedCommentHandler({ data });
  });

export const deleteFeedComment = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { feedCommentIdInput } = await import("./feeds.server");
    return feedCommentIdInput(data);
  })
  .handler(async ({ data }) => {
    const { deleteOwnFeedCommentHandler } = await import("./feeds.server");
    return deleteOwnFeedCommentHandler({ data });
  });

export const deleteFeedPost = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { feedIdInput } = await import("./feeds.server");
    return feedIdInput(data);
  })
  .handler(async ({ data }) => {
    const { deleteOwnFeedPostHandler } = await import("./feeds.server");
    return deleteOwnFeedPostHandler({ data });
  });

export const reportFeedPost = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { feedReportInput } = await import("./feeds.server");
    return feedReportInput(data);
  })
  .handler(async ({ data }) => {
    const { reportFeedPostHandler } = await import("./feeds.server");
    return reportFeedPostHandler({ data });
  });

export const undoFeedReport = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { feedIdInput } = await import("./feeds.server");
    return feedIdInput(data);
  })
  .handler(async ({ data }) => {
    const { undoFeedReportHandler } = await import("./feeds.server");
    return undoFeedReportHandler({ data });
  });

export const saveFeedPostToAgenda = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { feedSaveInput } = await import("./feeds.server");
    return feedSaveInput(data);
  })
  .handler(async ({ data }) => {
    const { saveFeedPostToAgendaHandler } = await import("./feeds.server");
    return saveFeedPostToAgendaHandler({ data });
  });

/* Admin */

export const getAdminFeeds = createServerFn({ method: "GET" }).handler(async () => {
  const { getAdminFeedsHandler } = await import("./feeds.server");
  return getAdminFeedsHandler();
});

export const runAdminFeedAction = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { adminFeedActionInput } = await import("./feeds.server");
    return adminFeedActionInput(data);
  })
  .handler(async ({ data }) => {
    const { adminFeedActionHandler } = await import("./feeds.server");
    return adminFeedActionHandler({ data });
  });

export const getAdminFeedComments = createServerFn({ method: "GET" })
  .validator(async (data: unknown) => {
    const { feedIdInput } = await import("./feeds.server");
    return feedIdInput(data);
  })
  .handler(async ({ data }) => {
    const { getAdminFeedCommentsHandler } = await import("./feeds.server");
    return getAdminFeedCommentsHandler({ data });
  });

export const runAdminFeedCommentAction = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { adminFeedCommentActionInput } = await import("./feeds.server");
    return adminFeedCommentActionInput(data);
  })
  .handler(async ({ data }) => {
    const { adminFeedCommentActionHandler } = await import("./feeds.server");
    return adminFeedCommentActionHandler({ data });
  });

export const saveAdminFeedsConfig = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { saveFeedsConfigInput } = await import("./feeds.server");
    return saveFeedsConfigInput(data);
  })
  .handler(async ({ data }) => {
    const { saveFeedsConfigHandler } = await import("./feeds.server");
    return saveFeedsConfigHandler({ data });
  });
