import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/plan/$id")({
  loader: ({ params }) => {
    throw redirect({ to: "/checkout/$id", params: { id: params.id } });
  },
  component: () => null,
});
