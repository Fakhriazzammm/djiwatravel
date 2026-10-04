import { ClipboardList } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin-shell";
export const Route = createFileRoute("/admin/orders")({ component: AdminOrders });
function AdminOrders() { return <AdminShell title="Orders" subtitle="Pantau payment-to-provisioning dengan filter yang dapat ditindaklanjuti."><div className="rounded-3xl border border-[#e5e5ea] bg-white p-8 text-center"><ClipboardList className="mx-auto size-9 text-[#0a84ff]" /><h2 className="mt-4 font-semibold">Order monitoring siap dihubungkan</h2><p className="mx-auto mt-2 max-w-lg text-sm text-[#6b6b72]">Table akan menampilkan order code, customer masked, amount, payment state, provisioning state, provider reference, expiry, dan last error setelah repository production tersedia.</p></div></AdminShell>; }
