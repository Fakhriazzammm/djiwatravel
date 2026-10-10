import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/admin-guard";
import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
export const Route = createFileRoute("/admin/provisioning")({ beforeLoad: () => requireAdmin(), head: () => ({ meta: [{ name: "robots", content: "noindex" }] }), component: AdminProvisioning });
function AdminProvisioning() { return <AdminShell title="Provisioning" subtitle="Antrean active, failed, stale, dan provider mismatch tanpa retry ganda."><div className="rounded-3xl border border-[#e5e5ea] bg-white p-8 text-center"><ShieldCheck className="mx-auto size-9 text-[#34c759]" /><h2 className="mt-4 font-semibold">Provisioning queue menunggu database</h2><p className="mx-auto mt-2 max-w-lg text-sm text-[#6b6b72]">Worker dan reconciliation akan mengisi queue ini. Action retry/reconcile akan memakai idempotency key dan read-back provider.</p></div></AdminShell>; }
