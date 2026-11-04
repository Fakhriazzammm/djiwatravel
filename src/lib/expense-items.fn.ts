import { createServerFn } from "@tanstack/react-start";

// RPC declarations for the per-item detail of an expense. Logic and ownership checks are server-only.

export const getExpenseDetail = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { getAuthenticatedUser } = await import("./customer-session.fn");
    const { readExpenseDetail } = await import("./expense-items.server");
    const user = await getAuthenticatedUser();
    return readExpenseDetail(user.id, data.id);
  });

export const saveExpenseItem = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { saveExpenseItemInput } = await import("./expense-items.server");
    return saveExpenseItemInput(data);
  })
  .handler(async ({ data }) => {
    const { getAuthenticatedUser } = await import("./customer-session.fn");
    const { saveExpenseItem: save } = await import("./expense-items.server");
    const user = await getAuthenticatedUser();
    return save(user.id, data);
  });

export const removeExpenseItem = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { removeExpenseItemInput } = await import("./expense-items.server");
    return removeExpenseItemInput(data);
  })
  .handler(async ({ data }) => {
    const { getAuthenticatedUser } = await import("./customer-session.fn");
    const { removeExpenseItem: remove } = await import("./expense-items.server");
    const user = await getAuthenticatedUser();
    return remove(user.id, data);
  });

export const updateExpenseInfo = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { updateExpenseInfoInput } = await import("./expense-items.server");
    return updateExpenseInfoInput(data);
  })
  .handler(async ({ data }) => {
    const { getAuthenticatedUser } = await import("./customer-session.fn");
    const { updateExpenseInfo: update } = await import("./expense-items.server");
    const user = await getAuthenticatedUser();
    return update(user.id, data);
  });
