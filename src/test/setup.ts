import "@testing-library/jest-dom/vitest";

// Route-tree tests import server modules; keep their DB client construction test-only.
process.env["DATABASE_URL"] ??= "postgresql://test.invalid/djiwatravel_test";

// Node-environment suites (for example provider-boundary checks) have no DOM.
if (typeof window !== "undefined") {
  if (typeof window.localStorage === "undefined") {
    const values = new Map<string, string>();
    const storage = {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(String(key)) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(String(key)),
      setItem: (key: string, value: string) => values.set(String(key), String(value)),
    } satisfies Storage;
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  }

  Object.defineProperty(window, "scrollTo", {
    writable: true,
    value: () => {},
  });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {},
    }),
  });
}
