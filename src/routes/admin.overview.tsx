import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/overview")({ beforeLoad: () => { throw redirect({ to: "/admin/dashboard" }); } });
