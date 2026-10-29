export function reportRuntimeError(error: unknown, context: Record<string, unknown> = {}) {
  if (import.meta.env.DEV) {
    console.error("[runtime-error]", error, context);
  }
}
