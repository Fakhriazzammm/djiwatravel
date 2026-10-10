import { FileClock } from "lucide-react";
import { requireAdmin } from "@/lib/admin-guard";
import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
export const Route = createFileRoute("/admin/audit-log")({ beforeLoad: () => requireAdmin(), head: () => ({ meta: [{ name: "robots", content: "noindex" }] }), component: AdminAuditLog });
function AdminAuditLog() { return <AdminShell title="Audit log" subtitle="Setiap login, retry, reconcile, QR reveal, refund, cancel, price change, settings change, dan role change harus dapat ditelusuri."><div className="rounded-3xl border border-[#e5e5ea] bg-white p-8 text-center"><FileClock className="mx-auto size-9 text-[#0a84ff]" /><h2 className="mt-4 font-semibold">Audit event store siap</h2><p className="mx-auto mt-2 max-w-lg text-sm text-[#6b6b72]">Migration 004 menyiapkan immutable audit log. Event belum ditampilkan sebelum admin session dan database production aktif.</p></div></AdminShell>; }
