import { CreditCard, Gauge, ListChecks, Settings, ShieldCheck } from "lucide-react";

export const adminNavigation = [
  ["Dashboard", "/admin/dashboard", Gauge],
  ["Orders", "/admin/orders", ListChecks],
  ["Payments", "/admin/payments", CreditCard],
  ["eSIM / Provisioning", "/admin/provisioning", ShieldCheck],
  ["Settings", "/admin/settings", Settings],
] as const;
