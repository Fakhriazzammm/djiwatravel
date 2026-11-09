import { createFileRoute } from "@tanstack/react-router";
import { TravoChat } from "@/components/travo-chat";
import { isTravoScope, type TravoScope } from "@/lib/trip-assistant";

type TravoSearch = { c?: string; trip?: string; q?: string; scope?: TravoScope };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/travo")({
  validateSearch: (search: Record<string, unknown>): TravoSearch => ({
    ...(typeof search["c"] === "string" && UUID.test(search["c"]) ? { c: search["c"] } : {}),
    ...(typeof search["trip"] === "string" && UUID.test(search["trip"])
      ? { trip: search["trip"] }
      : {}),
    ...(typeof search["q"] === "string" && search["q"].trim()
      ? { q: search["q"].trim().slice(0, 600) }
      : {}),
    ...(isTravoScope(search["scope"]) ? { scope: search["scope"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Travo: asisten perjalanan | Djiwa Travel" },
      {
        name: "description",
        content: "Ngobrol dengan Travo soal eSIM, tiket, trip, dan titip belanja.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TravoPage,
});

function TravoPage() {
  const { c, trip, q, scope } = Route.useSearch();
  return <TravoChat conversationId={c} tripParam={trip} initialQuery={q} initialScope={scope} />;
}
