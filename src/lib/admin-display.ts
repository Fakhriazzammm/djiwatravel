export type AdminCustomer = {
  label: "Customer — email masked" | "Nama belum tersedia";
  email: string | null;
  whatsapp: string | null;
};

export function maskEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const at = value.indexOf("@");
  if (at <= 0 || at === value.length - 1) return "••••••";
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  return `${local.slice(0, 1)}${"•".repeat(Math.min(5, Math.max(3, local.length)))}@${domain}`;
}

export function maskWhatsapp(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `${"•".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

export function toAdminCustomer(
  email: string | null | undefined,
  whatsapp: string | null | undefined,
): AdminCustomer {
  const maskedEmail = maskEmail(email);
  const maskedWhatsapp = maskWhatsapp(whatsapp);
  return {
    label: maskedEmail || maskedWhatsapp ? "Customer — email masked" : "Nama belum tersedia",
    email: maskedEmail,
    whatsapp: maskedWhatsapp,
  };
}

export function humanizeAdminStatus(status: string | null | undefined): string {
  if (!status) return "Status belum tersedia";
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function formatAdminDateTime(value: string | null | undefined): string {
  if (!value) return "Waktu belum tersedia";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Waktu belum tersedia" : date.toLocaleString("id-ID");
}
