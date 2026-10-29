import { toast } from "sonner";

export function isTripAuthenticationError(error: unknown): boolean {
  return (
    error instanceof Error && /autentikasi diperlukan|authentication required/i.test(error.message)
  );
}

export function isSafeTripReturnTo(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/my-trips/") || value.startsWith("//")) {
    return false;
  }

  try {
    const destination = new URL(value, "https://djiwatravel.com");
    return (
      destination.origin === "https://djiwatravel.com" &&
      destination.pathname.startsWith("/my-trips/")
    );
  } catch {
    return false;
  }
}

export async function runTripMutation({
  action,
  refresh,
  successMessage,
  failureMessage,
}: {
  action: () => Promise<unknown>;
  refresh: () => Promise<unknown>;
  successMessage: string;
  failureMessage: string;
}): Promise<boolean> {
  try {
    await action();
  } catch (error) {
    toast.error(
      isTripAuthenticationError(error)
        ? "Sesi berakhir. Masuk kembali untuk melanjutkan."
        : failureMessage,
    );
    return false;
  }

  toast.success(successMessage);
  try {
    await refresh();
  } catch {
    toast.error("Tersimpan, tetapi tampilan belum diperbarui. Muat ulang untuk melihat perubahan.");
  }
  return true;
}
