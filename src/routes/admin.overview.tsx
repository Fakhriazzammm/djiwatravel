import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/admin/overview")({ head: () => ({ meta: [{ name: "robots", content: "noindex" }] }), beforeLoad: () => { throw redirect({ to: "/admin/dashboard" }); } });
