import {
  CreditCard,
  BarChart3,
  FileClock,
  Gauge,
  LifeBuoy,
  ListChecks,
  RotateCcw,
  Settings,
  ShieldCheck,
  Tags,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react";

export const adminNavigation = [
  ["Dashboard", "/admin/dashboard", Gauge],
  ["Customers", "/admin/customers", UsersRound],
  ["Analytics", "/admin/analytics", BarChart3],
  ["Orders", "/admin/orders", ListChecks],
  ["Payments", "/admin/payments", CreditCard],
  ["Refunds", "/admin/refunds", RotateCcw],
  ["Support", "/admin/support", LifeBuoy],
  ["Keuangan", "/admin/finance", Wallet],
  ["Katalog", "/admin/catalog", Tags],
  ["Provisioning", "/admin/provisioning", ShieldCheck],
  ["Audit log", "/admin/audit-log", FileClock],
  ["Team", "/admin/team", UserRound],
  ["Settings", "/admin/settings", Settings],
] as const;

export function isAdminNavigationActive(pathname: string, href: string) {
  return (
    pathname === href ||
    (href !== "/admin/dashboard" && pathname.startsWith(`${href}/`)) ||
    (href === "/admin/dashboard" && pathname === "/admin")
  );
}
