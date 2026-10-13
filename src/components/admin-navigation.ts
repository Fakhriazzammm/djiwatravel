import { CreditCard, Gauge, ListChecks, Settings, ShieldCheck, Wallet } from "lucide-react";

export const adminNavigation = [
  ["Dashboard", "/admin/dashboard", Gauge],
  ["Orders", "/admin/orders", ListChecks],
  ["Payments", "/admin/payments", CreditCard],
  ["Keuangan", "/admin/finance", Wallet],
  ["eSIM / Provisioning", "/admin/provisioning", ShieldCheck],
  ["Settings", "/admin/settings", Settings],
] as const;
