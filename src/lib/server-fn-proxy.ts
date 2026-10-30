import { createServerFn } from "@tanstack/react-start";

type ServerFnMethod = "GET" | "POST";

type ExecutableServerFn = {
  __executeServer?: (options: {
    method: ServerFnMethod;
    data: unknown;
  }) => Promise<unknown>;
};

/**
 * Keeps route/client modules free of runtime imports from `*.server.ts` files.
 * The callback is only evaluated inside the server function handler, while the browser receives
 * TanStack Start's normal RPC stub.
 */
export function createServerFnProxy<TData, TResult>(
  method: ServerFnMethod,
  handler: (data: TData) => Promise<TResult> | TResult,
) {
  return createServerFn({ method })
    .validator((data: TData) => data)
    .handler(({ data }) => handler(data));
}

export function createNoArgServerFnProxy<TResult>(
  method: ServerFnMethod,
  handler: () => Promise<TResult> | TResult,
) {
  return createServerFn({ method }).handler(handler);
}

/**
 * Invokes an imported TanStack server function from another server handler without
 * entering its browser/RPC middleware path. The regular callable form is a client
 * fetcher; nested server handlers must use the server execution hook instead.
 */
export async function executeServerFn<TResult>(
  fn: ExecutableServerFn,
  method: ServerFnMethod,
  data?: unknown,
): Promise<TResult> {
  if (typeof fn.__executeServer !== "function") {
    throw new Error("Server function is missing its server execution hook");
  }

  const outcome = (await fn.__executeServer({ method, data })) as {
    result?: TResult;
    error?: unknown;
  };

  if (outcome.error) throw outcome.error;
  return outcome.result as TResult;
}
