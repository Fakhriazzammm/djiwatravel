import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Wallet } from "@/routes/wallet";
import { getCustomerWallet } from "@/lib/customer-wallet.server";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";

vi.mock("@/lib/customer-wallet.server", () => ({ getCustomerWallet: vi.fn() }));
vi.mock("@/lib/use-better-auth-user", () => ({ useBetterAuthUser: vi.fn() }));
vi.mock("@/components/shell", () => ({
  Page: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SectionTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  Wordmark: () => <img alt="Djiwa Travel" />,
}));

const mockedWallet = vi.mocked(getCustomerWallet);
const mockedAuth = vi.mocked(useBetterAuthUser);
const user = { id: "customer-1", name: "Fakhri", email: "fakhri@example.com" };
const walletResponse = {
  wallet: {
    customer_id: "customer-1",
    currency: "IDR" as const,
    available_balance: 125_000,
    held_balance: 0,
    total_credited: 150_000,
    total_debited: 25_000,
    status: "active" as const,
    updated_at: "2026-10-11T00:00:00.000Z",
  },
  ledger: [],
};

beforeEach(() => {
  mockedWallet.mockReset();
  mockedAuth.mockReset();
  mockedAuth.mockReturnValue({ user, setUser: vi.fn(), loading: false });
});
afterEach(cleanup);

describe("Wallet history scope filter", () => {
  it("defaults to all transactions and asks the server for the default scope", async () => {
    mockedWallet.mockResolvedValue(walletResponse);
    render(<Wallet />);

    expect(await screen.findByText("Wallet Djiwa Pay")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Semua transaksi" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Djiwa Travel" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(mockedWallet).toHaveBeenCalledWith({ data: { scope: "all" } });
  });

  it("re-reads the wallet with the Djiwa Travel scope when the filter is chosen", async () => {
    mockedWallet.mockResolvedValue(walletResponse);
    render(<Wallet />);
    await screen.findByText("Wallet Djiwa Pay");

    screen.getByRole("button", { name: "Djiwa Travel" }).click();

    await waitFor(() =>
      expect(mockedWallet).toHaveBeenCalledWith({ data: { scope: "djiwa-travel" } }),
    );
    expect(screen.getByRole("button", { name: "Djiwa Travel" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      await screen.findByText(/Transaksi tanpa keterangan asal aplikasi tidak ditampilkan/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Belum ada transaksi Djiwa Travel yang tercatat."),
    ).toBeInTheDocument();
  });

  it("keeps the loading splash and the error state while a scoped read fails", async () => {
    mockedWallet.mockRejectedValue(new Error("Wallet service unavailable"));
    render(<Wallet />);

    expect(await screen.findByText("Wallet belum dapat dimuat")).toBeInTheDocument();
    expect(screen.getByText("Wallet service unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("wallet-loading-splash")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Djiwa Travel" })).not.toBeInTheDocument();
  });
});
