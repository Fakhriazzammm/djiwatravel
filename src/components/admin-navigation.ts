import {
  Bell,
  CreditCard,
  FileClock,
  Handshake,
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
  ["Orders", "/admin/orders", ListChecks],
  ["Payments", "/admin/payments", CreditCard],
  ["Refunds", "/admin/refunds", RotateCcw],
  ["Support", "/admin/support", LifeBuoy],
  ["Notifikasi", "/admin/notifications", Bell],
  ["Keuangan", "/admin/finance", Wallet],
  ["Affiliate", "/admin/affiliates", Handshake],
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
