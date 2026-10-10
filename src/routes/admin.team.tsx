import { UsersRound } from "lucide-react";
import { requireAdmin } from "@/lib/admin-guard";
import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
export const Route = createFileRoute("/admin/team")({ beforeLoad: () => requireAdmin(), head: () => ({ meta: [{ name: "robots", content: "noindex" }] }), component: AdminTeam });
function AdminTeam() { return <AdminShell title="Team & roles" subtitle="Kelola admin user, role, permissions, active sessions, revoke, last login, dan MFA state."><div className="rounded-3xl border border-[#e5e5ea] bg-white p-8 text-center"><UsersRound className="mx-auto size-9 text-[#0a84ff]" /><h2 className="mt-4 font-semibold">Team management menunggu admin auth</h2><p className="mx-auto mt-2 max-w-lg text-sm text-[#6b6b72]">Migration 004 menyiapkan user, role, role mapping, dan session store. Tidak ada tindakan perubahan sebelum server-side authorization aktif.</p></div></AdminShell>; }
