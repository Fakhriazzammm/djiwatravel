import { createFileRoute } from "@tanstack/react-router";
import { ChatInbox } from "@/components/shopper/shopper-chat";

export const Route = createFileRoute("/titip-belanja/pesan/")({
  head: () => ({
    meta: [
      { title: "Pesan Titip Belanja — Djiwa Travel" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ChatInbox,
});
