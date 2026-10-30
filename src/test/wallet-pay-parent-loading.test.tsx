import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Wallet } from "@/routes/wallet";
import { getCustomerWallet } from "@/lib/customer-wallet.server";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";

vi.mock("@/lib/customer-wallet.server", () => ({ getCustomerWallet: vi.fn() }));
vi.mock("@/lib/use-better-auth-user", () => ({ useBetterAuthUser: vi.fn() }));
vi.mock("@/lib/customer-app-config.server", () => ({
  getCustomerAppConfig: vi.fn().mockResolvedValue({
    walletActions: [],
    topup: { presets: [], minimum: 50_000 },
  }),
  DEFAULT_TOPUP_PRESETS: [50_000],
  DEFAULT_MINIMUM_TOPUP: 50_000,
}));
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Outlet: () => <div data-testid="pay-outlet" />,
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { pathname: string } }) => unknown;
    }) => select({ location: { pathname: "/wallet/pay" } }),
  };
});
vi.mock("@/components/shell", () => ({
  Page: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SectionTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  Wordmark: () => <img alt="Djiwa Travel" />,
}));

const mockedWallet = vi.mocked(getCustomerWallet);
const mockedAuth = vi.mocked(useBetterAuthUser);

beforeEach(() => {
  mockedWallet.mockReset();
  mockedAuth.mockReturnValue({
    user: { id: "customer-1", name: "Fakhri", email: "fakhri@example.com" },
    setUser: vi.fn(),
    loading: false,
  });
});
afterEach(cleanup);

describe("Wallet Pay parent route loading", () => {
  it("renders the Pay child without starting the Travel wallet loader", async () => {
    mockedWallet.mockReturnValue(new Promise(() => {}));

    render(<Wallet />);

    expect(screen.getByTestId("pay-outlet")).toBeInTheDocument();
    expect(screen.queryByTestId("wallet-loading-splash")).not.toBeInTheDocument();
    await waitFor(() => expect(mockedWallet).not.toHaveBeenCalled());
  });
});
