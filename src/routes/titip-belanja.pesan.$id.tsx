import { createFileRoute } from "@tanstack/react-router";
import { ChatThread } from "@/components/shopper/shopper-chat";

export const Route = createFileRoute("/titip-belanja/pesan/$id")({
  head: () => ({
    meta: [
      { title: "Percakapan — Djiwa Travel" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ThreadPage,
});

function ThreadPage() {
  const { id } = Route.useParams();
  return <ChatThread id={id} />;
}
