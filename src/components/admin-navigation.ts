import { CreditCard, Gauge, ListChecks, Settings, ShieldCheck, Wallet } from "lucide-react";

export const adminNavigation = [
  ["Dashboard", "/admin/dashboard", Gauge],
  ["Orders", "/admin/orders", ListChecks],
  ["Pembayaran", "/admin/payments", CreditCard],
  ["Keuangan", "/admin/finance", Wallet],
  ["Provisioning", "/admin/provisioning", ShieldCheck],
  ["Settings", "/admin/settings", Settings],
] as const;

export function isAdminNavigationActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/admin/dashboard" && pathname.startsWith(`${href}/`)) ||
    (href === "/admin/dashboard" && pathname === "/admin")
  );
}
