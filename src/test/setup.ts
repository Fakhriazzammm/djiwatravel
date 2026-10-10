import "@testing-library/jest-dom/vitest";

// Route-tree tests import server modules; keep their DB client construction test-only.
process.env["DATABASE_URL"] ??= "postgresql://test.invalid/djiwatravel_test";

// Node-environment suites (for example provider-boundary checks) have no DOM.
if (typeof window !== "undefined") {
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
