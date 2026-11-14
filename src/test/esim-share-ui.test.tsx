import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/e.$token";
import { AdminEsimSharePanel } from "@/components/admin-esim-share-panel";
import { EsimShareSheet } from "@/components/esim-share-sheet";
import { claimSharedEsim, getEsimShareState } from "@/lib/esim-share.fn";
import { signInGoogle, signOutBetterAuth } from "@/lib/better-auth-client";
import { clearTravelLocalData } from "@/lib/travel-local-data";
import type { SharedEsimLanding } from "@/lib/esim-share";

const state = vi.hoisted(() => ({
  landing: null as unknown,
  auth: {
    user: null as { id: string; email?: string } | null,
    loading: false,
    setUser: vi.fn(),
  },
  shareState: null as unknown,
  adminState: null as unknown,
  fns: {
    claimSharedEsim: vi.fn(),
    getEsimShareState: vi.fn(),
    createEsimShareLink: vi.fn(),
    revokeEsimShareLink: vi.fn(),
    getAdminEsimShareState: vi.fn(),
    revokeAdminEsimShare: vi.fn(),
    signInGoogle: vi.fn(),
    signOutBetterAuth: vi.fn(),
    clearTravelLocalData: vi.fn(),
  },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useParams: () => ({ token: "shared-token" }),
    useLoaderData: () => state.landing,
  }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/lib/esim-share.fn", () => state.fns);
vi.mock("@/lib/better-auth-client", () => ({
  signInGoogle: state.fns.signInGoogle,
  signOutBetterAuth: state.fns.signOutBetterAuth,
}));
vi.mock("@/lib/use-better-auth-user", () => ({ useBetterAuthUser: () => state.auth }));
vi.mock("@/lib/travel-local-data", () => ({
  clearTravelLocalData: state.fns.clearTravelLocalData,
}));
vi.mock("@/components/shell", () => ({
  Page: ({ children }: { children: React.ReactNode }) => children,
  Wordmark: () => null,
  btnRed: "btn-red",
  btnSoft: "btn-soft",
  group: "group",
  row: "row",
}));
vi.mock("@/components/esim-install", () => ({
  EsimInstallPanel: () => <div data-testid="install-panel">Install eSIM</div>,
  ManualDetails: () => <div data-testid="manual-details">Manual details</div>,
}));
vi.mock("@/components/travel-usage-card", () => ({
  TravelUsageCard: () => <div data-testid="usage-card">Usage</div>,
}));
vi.mock("@/components/motion-primitives", () => ({
  FixedLayer: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/components/social-share", () => ({
  SocialShare: () => <button type="button">Bagikan eSIM</button>,
}));
vi.mock("@/lib/share-card", () => ({ renderBrandCard: vi.fn() }));
vi.mock("@/components/admin-shell", () => ({
  StatusPill: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/lib/admin-esim-share.fn", () => ({
  getAdminEsimShareState: state.fns.getAdminEsimShareState,
  revokeAdminEsimShare: state.fns.revokeAdminEsimShare,
}));

const preview: SharedEsimLanding = {
  state: "available",
  preview: {
    packageName: "Jepang 10GB",
    locationCodes: ["JP"],
    durationDays: 7,
    quotaBytes: 10_000_000_000,
    unlimited: false,
  },
};

function openLanding(claimMode: "account" | "browser"): SharedEsimLanding {
  return {
    state: "open",
    view: {
      packageName: "Jepang 10GB",
      locationCodes: ["JP"],
      durationDays: 7,
      quotaBytes: 10_000_000_000,
      unlimited: false,
      expiresAtMs: null,
      installed: false,
      usage: null,
      esim: { lpa: "LPA:1$smdp.example$ABC123", smdp: "smdp.example", activationCode: "ABC123" },
      claimMode,
    },
  } as SharedEsimLanding;
}

function renderRoute(landing: SharedEsimLanding = preview) {
  state.landing = landing;
  const Component = Route.component as React.ComponentType;
  return render(<Component />);
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  state.auth.user = null;
  state.auth.loading = false;
  state.shareState = null;
  state.adminState = null;
  state.fns.signInGoogle.mockResolvedValue(undefined);
  state.fns.signOutBetterAuth.mockResolvedValue(undefined);
});

describe("shared eSIM recipient experience", () => {
  it("shows a compact pre-claim preview, account CTA, mascot, and interactive Travo tip", () => {
    renderRoute();

    expect(screen.getByTestId("shared-esim-preview")).toBeTruthy();
    expect(screen.getByText("Jepang 10GB")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Masuk untuk klaim" })).toBeTruthy();
    expect(screen.getByRole("img", { name: /maskot djiwa travel/i })).toHaveAttribute(
      "src",
      "/assets/home-hero/mascot-v6.png",
    );
    const mascot = screen.getByRole("button", { name: "Tanya Travo" });
    fireEvent.click(mascot);
    expect(mascot).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/akun yang kamu pakai untuk masuk/i)).toBeTruthy();
  });

  it("returns Google sign-in to the exact shared link", async () => {
    window.history.replaceState(null, "", "/e/shared-token");
    renderRoute();
    fireEvent.click(screen.getByRole("button", { name: "Masuk untuk klaim" }));
    fireEvent.click(screen.getByRole("button", { name: "Lanjutkan dengan Google" }));
    await waitFor(() => expect(signInGoogle).toHaveBeenCalledWith(window.location.href));
  });

  it("claims for the signed-in user and transitions to account-saved installation", async () => {
    state.auth.user = { id: "verified-user", email: "recipient@example.test" };
    state.fns.claimSharedEsim.mockResolvedValue(openLanding("account"));
    renderRoute();

    fireEvent.click(screen.getByRole("button", { name: "Klaim eSIM ini" }));

    await waitFor(() =>
      expect(claimSharedEsim).toHaveBeenCalledWith({ data: { token: "shared-token" } }),
    );
    expect(await screen.findByTestId("shared-esim-open")).toBeTruthy();
    expect(screen.getByTestId("install-panel")).toBeTruthy();
    expect(screen.getByText("Tersimpan di akunmu")).toBeTruthy();
    expect(screen.getByText(/akun yang sama dari browser lain/i)).toBeTruthy();
  });

  it("does not show installation data to a different or signed-out recipient", () => {
    renderRoute({ state: "claimed_elsewhere" });
    expect(screen.getByText("eSIM ini sudah diklaim akun lain")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Masuk dengan akun penerima" })).toBeTruthy();
    expect(screen.queryByTestId("install-panel")).toBeNull();
    expect(screen.queryByText(/activation code/i)).toBeNull();
  });

  it("offers an explicit account switch without losing the shared link", async () => {
    state.auth.user = { id: "other-user", email: "other@example.test" };
    renderRoute({ state: "claimed_elsewhere" });
    fireEvent.click(screen.getByRole("button", { name: "Pakai akun lain" }));

    await waitFor(() => expect(signOutBetterAuth).toHaveBeenCalledOnce());
    expect(clearTravelLocalData).toHaveBeenCalledOnce();
    expect(state.auth.setUser).toHaveBeenCalledWith(null);
  });

  it("keeps a retryable error visible if the claim request fails", async () => {
    state.auth.user = { id: "verified-user" };
    state.fns.claimSharedEsim.mockRejectedValue(new Error("network unavailable"));
    renderRoute();
    fireEvent.click(screen.getByRole("button", { name: "Klaim eSIM ini" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Periksa koneksi lalu coba lagi");
    expect(screen.getByRole("button", { name: "Klaim eSIM ini" })).toBeEnabled();
  });

  it("uses accurate instructions for legacy browser claims", () => {
    renderRoute(openLanding("browser"));
    expect(screen.getByText("Tersimpan di browser ini")).toBeTruthy();
    expect(screen.getByText(/pengirim membuat link baru/i)).toBeTruthy();
  });
});

describe("owner and Admin eSIM share status", () => {
  it("calls a claim account-saved in the owner share sheet", async () => {
    state.fns.getEsimShareState.mockResolvedValue({
      enabled: true,
      eligible: true,
      link: {
        token: "s".repeat(32),
        createdAt: "2026-11-01T00:00:00.000Z",
        claimed: true,
        claimedAt: "2026-11-03T00:00:00.000Z",
        viewCount: 2,
        lastOpenedAt: "2026-11-04T00:00:00.000Z",
      },
    });
    render(
      <EsimShareSheet orderId="order-1" packageName="Jepang 10GB" open onClose={() => undefined} />,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("Sudah diklaim penerima");
    expect(screen.getByText(/browser lain dengan akun yang sama/i)).toBeTruthy();
  });

  it("shows the claim state in Admin without exposing the claimant", () => {
    render(
      <AdminEsimSharePanel
        orderId="order-1"
        initial={{
          enabled: true,
          eligible: true,
          link: {
            createdAt: "2026-11-01T00:00:00.000Z",
            claimed: true,
            claimedAt: "2026-11-03T00:00:00.000Z",
            viewCount: 2,
            lastOpenedAt: "2026-11-04T00:00:00.000Z",
          },
        }}
      />,
    );

    expect(screen.getByText("Sudah diklaim")).toBeTruthy();
    expect(screen.getByText(/Diklaim/)).toBeTruthy();
    expect(screen.queryByText(/recipient@example.test|verified-user/)).toBeNull();
  });
});
