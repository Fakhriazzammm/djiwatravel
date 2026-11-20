export type TravelServiceStatus = "ACTIVE" | "AFFILIATE" | "COMING_SOON" | "DISABLED";

export type TravelServiceCategory = {
  id: string;
  label: string;
  description: string;
  icon: string;
  status: TravelServiceStatus;
  href?: "/explore" | "/esim/finder" | "/tiket" | "/template" | "/titip-belanja" | "/kirim-barang";
  displayOrder: number;
};

export const travelServices: TravelServiceCategory[] = [
  {
    id: "esim",
    label: "eSIM",
    description: "Internet saat tiba",
    icon: "esim",
    status: "ACTIVE",
    href: "/esim/finder",
    displayOrder: 1,
  },
  {
    id: "flights",
    label: "Tiket",
    description: "Cari tiket pesawat",
    icon: "transportation",
    status: "ACTIVE",
    href: "/tiket",
    displayOrder: 2,
  },
  {
    id: "templates",
    label: "Itinerary",
    description: "Itinerary siap pakai",
    icon: "itinerary",
    status: "ACTIVE",
    href: "/template",
    displayOrder: 2.5,
  },
  {
    id: "attractions",
    label: "Aktivitas",
    description: "Atraksi & wisata",
    icon: "attractions",
    status: "COMING_SOON",
    displayOrder: 3,
  },
  {
    id: "open-trip",
    label: "Open Trip",
    description: "Jalan bersama",
    icon: "open-trip",
    status: "COMING_SOON",
    displayOrder: 4,
  },
  {
    id: "shipping",
    label: "Kirim Barang",
    description: "Express mancanegara",
    icon: "shipping",
    status: "COMING_SOON",
    displayOrder: 5,
  },
  {
    id: "personal-shopper",
    label: "Titip Belanja",
    description: "Belanja dari jauh",
    icon: "personal-shopper",
    status: "COMING_SOON",
    displayOrder: 6,
  },
  {
    id: "visa",
    label: "Visa",
    description: "Bantuan dokumen",
    icon: "visa",
    status: "COMING_SOON",
    displayOrder: 7,
  },
  {
    id: "travel-insurance",
    label: "Asuransi",
    description: "Perjalanan lebih tenang",
    icon: "travel-insurance",
    status: "COMING_SOON",
    displayOrder: 8,
  },
];

export const serviceStatusLabel: Record<TravelServiceStatus, string> = {
  ACTIVE: "Tersedia",
  AFFILIATE: "Partner",
  COMING_SOON: "Segera hadir",
  DISABLED: "Tidak tersedia",
};

export const visibleTravelServices = () =>
  travelServices
    .filter((service) => service.status !== "DISABLED")
    .sort((a, b) => a.displayOrder - b.displayOrder);

export function serviceHref(
  service: TravelServiceCategory,
):
  "/explore" | "/esim/finder" | "/tiket" | "/template" | "/titip-belanja" | "/kirim-barang" | null {
  return service.status === "ACTIVE" ? (service.href ?? null) : null;
}
