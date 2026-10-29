export type TravelServiceStatus = "ACTIVE" | "AFFILIATE" | "COMING_SOON" | "DISABLED";

export type TravelServiceCategory = {
  id: string;
  label: string;
  description: string;
  icon: string;
  status: TravelServiceStatus;
  href?: "/explore" | "/esim/finder";
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
    id: "attractions",
    label: "Aktivitas",
    description: "Atraksi & wisata",
    icon: "attractions",
    status: "COMING_SOON",
    displayOrder: 2,
  },
  {
    id: "transportation",
    label: "Transportasi",
    description: "Tiket & transfer",
    icon: "transportation",
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
    id: "baggage",
    label: "Bagasi",
    description: "Kirim tanpa repot",
    icon: "baggage",
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

export function serviceHref(service: TravelServiceCategory): "/explore" | "/esim/finder" | null {
  return service.status === "ACTIVE" ? (service.href ?? null) : null;
}
