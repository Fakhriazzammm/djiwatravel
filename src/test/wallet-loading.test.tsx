import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

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
});
afterEach(cleanup);

describe("Wallet loading transitions", () => {
  it("keeps the branded splash visible during auth loading without a skeleton", () => {
    mockedAuth.mockReturnValue({ user: null, setUser: vi.fn(), loading: true });
    render(<Wallet />);

    expect(screen.getByTestId("wallet-loading-splash")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Menyiapkan Wallet…")).toBeInTheDocument();
    expect(screen.queryByTestId("pending-card")).not.toBeInTheDocument();
    expect(screen.queryByText("Wallet Djiwa Pay")).not.toBeInTheDocument();
    expect(mockedWallet).not.toHaveBeenCalled();
  });

  it("keeps the branded splash visible while wallet data is loading", async () => {
    mockedAuth.mockReturnValue({ user, setUser: vi.fn(), loading: false });
    mockedWallet.mockReturnValue(new Promise(() => {}));
    render(<Wallet />);

    await waitFor(() => expect(mockedWallet).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("wallet-loading-splash")).toBeInTheDocument();
    expect(screen.queryByTestId("pending-card")).not.toBeInTheDocument();
  });

  it("renders Wallet after data resolves", async () => {
    mockedAuth.mockReturnValue({ user, setUser: vi.fn(), loading: false });
    mockedWallet.mockResolvedValue(walletResponse);
    render(<Wallet />);

    expect(await screen.findByText("Wallet Djiwa Pay")).toBeInTheDocument();
    expect(screen.queryByTestId("wallet-loading-splash")).not.toBeInTheDocument();
  });

  it("renders the error state after a failed read instead of an endless splash", async () => {
    mockedAuth.mockReturnValue({ user, setUser: vi.fn(), loading: false });
    mockedWallet.mockRejectedValue(new Error("Wallet service unavailable"));
    render(<Wallet />);

    expect(await screen.findByText("Wallet belum dapat dimuat")).toBeInTheDocument();
    expect(screen.getByText("Wallet service unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("wallet-loading-splash")).not.toBeInTheDocument();
  });
});
