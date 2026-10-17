import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerAuth } from "@/components/customer-auth";
import { signInGoogle } from "@/lib/better-auth-client";

vi.mock("@/lib/better-auth-client", () => ({ signInGoogle: vi.fn() }));
afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());

function openGoogleAuth() {
  render(<CustomerAuth onAuthenticated={vi.fn()} />);
  fireEvent.click(screen.getByText("Masuk atau daftar"));
  return screen.getByRole("button", { name: "Lanjutkan dengan Google" });
}

describe("Customer Google authentication", () => {
  it("starts OAuth with the public origin callback", async () => {
    vi.mocked(signInGoogle).mockResolvedValue(undefined);
    fireEvent.click(openGoogleAuth());
    await waitFor(() =>
      expect(signInGoogle).toHaveBeenCalledWith(`${window.location.origin}/profile`),
    );
  });

  it("shows a user-visible error when OAuth initiation fails", async () => {
    vi.mocked(signInGoogle).mockRejectedValue(new Error("oauth unavailable"));
    fireEvent.click(openGoogleAuth());
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Google gagal. Coba lagi."),
    );
  });
});
