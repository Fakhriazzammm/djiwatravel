import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Wallet } from "@/routes/wallet";
import { getCustomerWallet } from "@/lib/customer-wallet.fn";
import { useBetterAuthUser } from "@/lib/use-better-auth-user";
import { PAY_ACTIONS, PAY_PPOB_SERVICES } from "@/lib/djiwa-pay-services";

vi.mock("@/lib/customer-wallet.fn", () => ({ getCustomerWallet: vi.fn() }));
vi.mock("@/lib/use-better-auth-user", () => ({ useBetterAuthUser: vi.fn() }));
vi.mock("@tanstack/react-router", async () => {
  const actual =
    await vi.importActual<typeof import("@tanstack/react-router")>("@tanstack/react-router");
  return {
    ...actual,
    Link: ({
      to,
      children,
      ...rest
    }: { to: string; children?: ReactNode } & Record<string, unknown>) => (
      <a href={to} {...rest}>
        {children}
      </a>
    ),
    Outlet: () => null,
    useRouterState: () => ({ location: { pathname: "/wallet" } }),
  };
});
vi.mock("@/components/shell", () => ({
  Page: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SectionTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  Wordmark: () => <img alt="Djiwa Travel" />,
}));

const mockedWallet = vi.mocked(getCustomerWallet);
const mockedAuth = vi.mocked(useBetterAuthUser);
const wallet = {
  customer_id: "customer-1",
  currency: "IDR" as const,
  available_balance: 124_500,
  held_balance: 0,
  total_credited: 350_000,
  total_debited: 225_500,
  status: "active" as const,
  updated_at: "2026-11-01T00:00:00.000Z",
};
const entry = (id: number, source_app: string | null) => ({
  id,
  amount: 15_000,
  direction: "debit" as const,
  balance_after: 100_000,
  status: "completed",
  transaction_type: "order_debit",
  reference_type: "order",
  reference_id: `ref-${id}`,
  note: `Transaksi ${id}`,
  created_at: "2026-11-01T01:00:00.000Z",
  source_app,
});

beforeEach(() => {
  mockedWallet.mockReset();
  mockedAuth.mockReset();
  mockedAuth.mockReturnValue({
    user: { id: "customer-1", name: "Fakhri", email: "f@example.com" },
    setUser: vi.fn(),
    loading: false,
  });
});
afterEach(cleanup);

describe("Wallet redesign", () => {
  it("tells the customer what Djiwa Pay offers and links each item to the Pay page", async () => {
    mockedWallet.mockResolvedValue({ wallet, ledger: [] });
    render(<Wallet />);
    const section = (await screen.findByText("Di Djiwa Pay")).closest("section")!;

    for (const action of PAY_ACTIONS.filter((item) => item.available)) {
      expect(
        within(section).getByRole("link", { name: `${action.label}: buka di Djiwa Pay` }),
      ).toHaveAttribute("href", "/wallet/pay");
    }
    // Pay itself marks withdrawals as coming soon, so Travel does not offer a dead link.
    expect(within(section).getByLabelText("Tarik Dana, segera hadir")).toBeInTheDocument();
    for (const name of PAY_PPOB_SERVICES) {
      expect(within(section).getByRole("link", { name })).toHaveAttribute("href", "/wallet/pay");
    }
    expect(screen.queryByText(/dibuka lewat tombol/i)).not.toBeInTheDocument();
  });

  it("keeps the native quick actions and a way to buy an eSIM from the balance", async () => {
    mockedWallet.mockResolvedValue({ wallet, ledger: [] });
    render(<Wallet />);
    await screen.findByText("Wallet Djiwa Pay");
    // One prominent button on the balance card and one in the quick-action grid.
    expect(screen.getAllByRole("button", { name: "Isi Saldo" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Beli eSIM dengan saldo" })).toHaveAttribute(
      "href",
      "/esim/finder",
    );
  });

  it("marks only ledger rows attributed to Djiwa Travel", async () => {
    mockedWallet.mockResolvedValue({
      wallet,
      ledger: [entry(1, "djiwa-travel"), entry(2, null)],
    });
    render(<Wallet />);
    await screen.findByText("Transaksi 1");
    expect(screen.getAllByText("Djiwa Travel", { selector: "span" })).toHaveLength(1);
  });
});
