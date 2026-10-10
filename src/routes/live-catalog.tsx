import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/live-catalog")({ beforeLoad: () => { throw redirect({ to: "/explore", replace: true }); } });
