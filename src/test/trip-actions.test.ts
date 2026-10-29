import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { isSafeTripReturnTo, isTripAuthenticationError, runTripMutation } from "@/lib/trip-actions";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe("runTripMutation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports expired sessions and does not claim the change was saved", async () => {
    const refresh = vi.fn();
    const saved = await runTripMutation({
      action: async () => {
        throw new Error("Autentikasi diperlukan");
      },
      refresh,
      successMessage: "Agenda disimpan",
      failureMessage: "Agenda belum tersimpan. Coba lagi.",
    });

    expect(saved).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Sesi berakhir. Masuk kembali untuk melanjutkan.");
  });

  it("confirms a saved change even when refreshing the screen fails", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    const refresh = vi.fn().mockRejectedValue(new Error("refresh failed"));
    const saved = await runTripMutation({
      action,
      refresh,
      successMessage: "Agenda disimpan",
      failureMessage: "Agenda belum tersimpan. Coba lagi.",
    });

    expect(saved).toBe(true);
    expect(action).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith("Agenda disimpan");
    expect(toast.error).toHaveBeenCalledWith(
      "Tersimpan, tetapi tampilan belum diperbarui. Muat ulang untuk melihat perubahan.",
    );
  });

  it("recognizes expired sessions and only accepts an internal My Trips return path", () => {
    expect(isTripAuthenticationError(new Error("Autentikasi diperlukan"))).toBe(true);
    expect(isTripAuthenticationError(new Error("database unavailable"))).toBe(false);
    expect(isSafeTripReturnTo("/my-trips/trip-id/itinerary")).toBe(true);
    expect(isSafeTripReturnTo("https://attacker.example/")).toBe(false);
    expect(isSafeTripReturnTo("//attacker.example/my-trips")).toBe(false);
  });
});
