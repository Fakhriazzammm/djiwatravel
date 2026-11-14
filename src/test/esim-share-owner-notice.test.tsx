import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OwnerShareNotice } from "@/components/esim-share/owner-share-notice";
import { useClaimedShareLink } from "@/hooks/use-claimed-share-link";

const getEsimShareState = vi.hoisted(() => vi.fn());
vi.mock("@/lib/esim-share.fn", () => ({ getEsimShareState }));

const link = (claimed: boolean) => ({
  token: "t".repeat(32),
  createdAt: "2026-11-14T08:00:00.000Z",
  claimed,
  claimedAt: claimed ? "2026-11-14T09:37:36.000Z" : null,
  viewCount: 2,
  lastOpenedAt: null,
});

function Harness({ enabled = true }: { enabled?: boolean }) {
  const claimed = useClaimedShareLink("order-1", enabled);
  return claimed ? <OwnerShareNotice link={claimed} /> : <p>kosong</p>;
}

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

describe("owner notice for a claimed but not installed share", () => {
  it("says the eSIM is claimed but not installed, with when it was claimed", async () => {
    getEsimShareState.mockResolvedValue({ enabled: true, eligible: true, link: link(true) });
    render(<Harness />);

    const notice = await screen.findByTestId("owner-share-notice");
    expect(notice).toHaveTextContent("Sudah diklaim penerima, belum dipasang");
    expect(notice).toHaveTextContent(/scan di HP-nya/i);
    expect(notice).toHaveTextContent(/pada \d/);
    expect(getEsimShareState).toHaveBeenCalledWith({ data: { orderId: "order-1" } });
  });

  it("shows nothing for an unclaimed link, no link, a failed read or a disabled check", async () => {
    getEsimShareState.mockResolvedValue({ enabled: true, eligible: true, link: link(false) });
    const first = render(<Harness />);
    await waitFor(() => expect(getEsimShareState).toHaveBeenCalledOnce());
    expect(screen.queryByTestId("owner-share-notice")).toBeNull();
    first.unmount();

    getEsimShareState.mockResolvedValue({ enabled: true, eligible: true, link: null });
    const second = render(<Harness />);
    await waitFor(() => expect(getEsimShareState).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("owner-share-notice")).toBeNull();
    second.unmount();

    getEsimShareState.mockRejectedValue(new Error("down"));
    const third = render(<Harness />);
    await waitFor(() => expect(getEsimShareState).toHaveBeenCalledTimes(3));
    expect(screen.queryByTestId("owner-share-notice")).toBeNull();
    third.unmount();

    render(<Harness enabled={false} />);
    expect(getEsimShareState).toHaveBeenCalledTimes(3);
  });
});
