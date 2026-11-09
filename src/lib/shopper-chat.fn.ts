import { createServerFn } from "@tanstack/react-start";

export const getChatUnread = createServerFn({ method: "GET" }).handler(async () => {
  const { chatUnreadHandler } = await import("./shopper-chat.server");
  return chatUnreadHandler();
});
export const listMyChatThreads = createServerFn({ method: "GET" }).handler(async () => {
  const { listMyThreadsHandler } = await import("./shopper-chat.server");
  return listMyThreadsHandler();
});
export const getMyChatThread = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shopper-chat.server")).threadInput(data))
  .handler(async ({ data }) =>
    (await import("./shopper-chat.server")).getMyThreadHandler({ data }),
  );
export const startMyChatThread = createServerFn({ method: "POST" })
  .validator(async (data: unknown) =>
    (await import("./shopper-chat.server")).startThreadInput(data),
  )
  .handler(async ({ data }) =>
    (await import("./shopper-chat.server")).startMyThreadHandler({ data }),
  );
export const sendMyChatMessage = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shopper-chat.server")).sendInput(data))
  .handler(async ({ data }) =>
    (await import("./shopper-chat.server")).sendMyMessageHandler({ data }),
  );
export const openOrderChatThread = createServerFn({ method: "POST" })
  .validator(async (data: unknown) =>
    (await import("./shopper-chat.server")).orderThreadInput(data),
  )
  .handler(async ({ data }) =>
    (await import("./shopper-chat.server")).openOrderThreadHandler({ data }),
  );

export const getAdminChatList = createServerFn({ method: "GET" }).handler(async () => {
  const { adminChatListHandler } = await import("./shopper-chat.server");
  return adminChatListHandler();
});
export const getAdminChatThread = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shopper-chat.server")).threadInput(data))
  .handler(async ({ data }) =>
    (await import("./shopper-chat.server")).adminChatThreadHandler({ data }),
  );
export const sendAdminChatMessage = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shopper-chat.server")).adminSendInput(data))
  .handler(async ({ data }) =>
    (await import("./shopper-chat.server")).adminChatSendHandler({ data }),
  );
export const assignAdminChat = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shopper-chat.server")).assignInput(data))
  .handler(async ({ data }) =>
    (await import("./shopper-chat.server")).adminChatAssignHandler({ data }),
  );
export const closeAdminChat = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => (await import("./shopper-chat.server")).closeInput(data))
  .handler(async ({ data }) =>
    (await import("./shopper-chat.server")).adminChatCloseHandler({ data }),
  );
export const getAdminChatUnread = createServerFn({ method: "GET" }).handler(async () => {
  const { adminChatUnreadHandler } = await import("./shopper-chat.server");
  return adminChatUnreadHandler();
});
