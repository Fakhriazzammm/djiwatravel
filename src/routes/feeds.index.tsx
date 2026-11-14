import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The timeline moved into Explore. Old links and bookmarks to /feeds land there, and the
 * "Bagikan ke Feeds" link from a delivered Titip Belanja order keeps opening the composer.
 */
export const Route = createFileRoute("/feeds/")({
  validateSearch: (search: Record<string, unknown>): { tulis?: "titip" } =>
    search["tulis"] === "titip" ? { tulis: "titip" } : {},
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/explore",
      search: search.tulis ? { tulis: search.tulis } : {},
      replace: true,
    });
  },
});
