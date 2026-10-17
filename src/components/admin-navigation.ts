import { CreditCard, Gauge, LifeBuoy, ListChecks, RotateCcw, Settings, ShieldCheck, Wallet } from "lucide-react";

export const adminNavigation = [
  ["Dashboard", "/admin/dashboard", Gauge],
  ["Orders", "/admin/orders", ListChecks],
  ["Payments", "/admin/payments", CreditCard],
  ["Refunds", "/admin/refunds", RotateCcw],
  ["Support", "/admin/support", LifeBuoy],
  ["Keuangan", "/admin/finance", Wallet],
  ["Katalog", "/admin/catalog", Tags],
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
