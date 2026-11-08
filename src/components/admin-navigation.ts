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
  ShoppingBag,
  ShoppingCart,
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
  ["Pre-order", "/admin/preorders", ShoppingBag],
  ["Titip Belanja", "/admin/shopping", ShoppingCart],
  ["Provisioning", "/admin/provisioning", ShieldCheck],
  ["Audit log", "/admin/audit-log", FileClock],
  ["Team", "/admin/team", UserRound],
  ["Settings", "/admin/settings", Settings],
] as const;

export const adminNavigationGroups = [
  { label: "Ringkasan", items: [adminNavigation[0]] },
  {
    label: "eSIM",
    items: [
      ["Pesanan eSIM", "/admin/orders", ListChecks],
      ["Katalog & Harga", "/admin/catalog", Tags],
      adminNavigation[10],
      ["Aktivasi & Provisioning", "/admin/provisioning", ShieldCheck],
      ["Pengaturan eSIM", "/admin/settings#esim", Settings],
    ],
  },
  {
    label: "Titip Belanja",
    items: [
      ["Pesanan", "/admin/shopping", ShoppingCart],
      ["Katalog Produk", "/admin/shopping#catalog", Tags],
      ["Pengaturan", "/admin/shopping#settings", Settings],
    ],
  },
  {
    label: "Fitur Travel",
    items: [
      ["Itinerary & Peta", "/admin/settings#itinerary", Tags],
      ["Scan Struk", "/admin/settings#receipt", Tags],
      ["Penerbangan", "/admin/settings#flights", Tags],
      ["Ide Tempat", "/admin/settings#places", Tags],
      ["Akses Tamu", "/admin/settings#guests", UsersRound],
    ],
  },
  {
    label: "Pelanggan & Layanan",
    items: [
      ["Pelanggan", "/admin/customers", UsersRound],
      ["Bantuan", "/admin/support", LifeBuoy],
      adminNavigation[6],
    ],
  },
  {
    label: "Keuangan",
    items: [
      ["Pembayaran", "/admin/payments", CreditCard],
      ["Refund", "/admin/refunds", RotateCcw],
      ["Laporan Keuangan", "/admin/finance", Wallet],
    ],
  },
  {
    label: "Pemasaran",
    items: [adminNavigation[8], ["SEO & Google", "/admin/settings#marketing", Tags]],
  },
  {
    label: "Sistem",
    items: [
      ["Tim & Akses", "/admin/team", UserRound],
      adminNavigation[13],
      ["PWA", "/admin/settings#pwa", Settings],
      ["Status Integrasi", "/admin/settings", Settings],
    ],
  },
] as const;

export function isAdminNavigationActive(pathname: string, href: string, hash = "") {
  const [path, anchor = ""] = href.split("#");
  return (
    (pathname === path ||
      (path !== "/admin/dashboard" && pathname.startsWith(`${path}/`)) ||
      (path === "/admin/dashboard" && pathname === "/admin")) &&
    hash.replace(/^#/, "") === anchor
  );
}
