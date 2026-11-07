import { createServerFn } from "@tanstack/react-start";

// RPC declarations for the per-item detail of an expense. Logic and ownership checks are server-only.

export const getExpenseDetail = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { requireTripOwner } = await import("./guest-trips.server");
    const { readExpenseDetail } = await import("./expense-items.server");
    const user = await requireTripOwner();
    return readExpenseDetail(user.id, data.id);
  });

export const saveExpenseItem = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { saveExpenseItemInput } = await import("./expense-items.server");
    return saveExpenseItemInput(data);
  })
  .handler(async ({ data }) => {
    const { requireTripOwner } = await import("./guest-trips.server");
    const { saveExpenseItem: save } = await import("./expense-items.server");
    const user = await requireTripOwner();
    return save(user.id, data);
  });

export const removeExpenseItem = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { removeExpenseItemInput } = await import("./expense-items.server");
    return removeExpenseItemInput(data);
  })
  .handler(async ({ data }) => {
    const { requireTripOwner } = await import("./guest-trips.server");
    const { removeExpenseItem: remove } = await import("./expense-items.server");
    const user = await requireTripOwner();
    return remove(user.id, data);
  });

export const updateExpenseInfo = createServerFn({ method: "POST" })
  .validator(async (data: unknown) => {
    const { updateExpenseInfoInput } = await import("./expense-items.server");
    return updateExpenseInfoInput(data);
  })
  .handler(async ({ data }) => {
    const { requireTripOwner } = await import("./guest-trips.server");
    const { updateExpenseInfo: update } = await import("./expense-items.server");
    const user = await requireTripOwner();
    return update(user.id, data);
  });
