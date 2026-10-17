import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TravelTimeline } from "../components/travel-timeline";
import { TravelUsageCard } from "../components/travel-usage-card";
import { TravelChecklist } from "../components/travel-checklist";
import { OfflineSnapshotBanner } from "../components/offline-snapshot-banner";
import { TravelSupportDialog } from "../components/travel-support-dialog";
import { activationTimeline, checklistProgress, usageView } from "../lib/travel-journey";
import { buildTravelSnapshot } from "../lib/offline-travel-snapshot";
import { buildSupportContext, supportTopicsFor } from "../lib/travel-support";
import type { Order } from "../lib/orders";

const ORDER_ID = "eeeeeeee-5555-4555-8555-eeeeeeeeeeee";

function order(): Order {
  return {
    id: ORDER_ID,
    publicOrderCode: "DJW-ZZZZ9999",
    packageId: "JP-5GB-7D",
    packageName: "Jepang 5GB",
    locationCodes: ["JP"],
    durationDays: 7,
    volumeBytes: 5_000_000_000,
    amount: 125_000,
    method: "qris",
    status: "READY",
    createdAt: Date.parse("2026-08-01T00:00:00Z"),
    esim: {
      lpa: "LPA:1$smdp.example$SECRET-ACTIVATION",
      smdp: "smdp.example",
      activationCode: "SECRET-ACTIVATION",
      iccid: "89852345678901234567",
    },
  };
}

describe("TravelTimeline", () => {
  it("shows the failed stage for a failed provisioning order", () => {
    render(<TravelTimeline timeline={activationTimeline("PROVISIONING_FAILED")} lastSyncedAt={null} />);
    expect(screen.getByTestId("travel-timeline")).toBeInTheDocument();
    expect(screen.getByText("Pemrosesan belum berhasil")).toBeInTheDocument();
    expect(screen.getByText("Pembayaran")).toBeInTheDocument();
    expect(screen.getAllByText("gagal").length).toBeGreaterThan(0);
  });

  it("does not offer a refresh once the state is terminal", () => {
    render(
      <TravelTimeline
        timeline={activationTimeline("EXPIRED")}
        lastSyncedAt={null}
        onRefresh={() => undefined}
      />,
    );
    expect(screen.queryByRole("button", { name: /perbarui status/i })).toBeNull();
  });

  it("says the status is unconfirmed instead of showing success", () => {
    render(
      <TravelTimeline
        timeline={activationTimeline("PROVISIONING")}
        lastSyncedAt={null}
        syncFailed
        onRefresh={() => undefined}
      />,
    );
    expect(screen.getByText(/belum dapat dikonfirmasi/i)).toBeInTheDocument();
    expect(screen.queryByText(/eSIM kamu siap/i)).toBeNull();
  });
});

describe("TravelUsageCard", () => {
  it("states that usage is unavailable rather than inventing zero", () => {
    const view = usageView({ volumeBytes: 5_000_000_000, usedGb: null, active: true });
    const { container } = render(<TravelUsageCard view={view} />);
    expect(screen.getByText(/Pemakaian belum dilaporkan penyedia/i)).toBeInTheDocument();
    expect(container.textContent).not.toContain("0.0 GB tersisa");
  });

  it("renders the provider numbers when they exist", () => {
    const view = usageView({ volumeBytes: 10_000_000_000, usedGb: 9, active: true });
    render(<TravelUsageCard view={view} />);
    expect(screen.getByText(/tersisa dari 10.0 GB/)).toBeInTheDocument();
    expect(screen.getByText("Sisa 10% · terpakai 9.0 GB")).toBeInTheDocument();
    expect(screen.getByText(/Kuota tinggal 10%/)).toBeInTheDocument();
  });
});

describe("TravelChecklist", () => {
  it("renders the departure field and calls back on tick", () => {
    const items = [
      {
        key: "install" as const,
        label: "Pasang eSIM",
        hint: "Butuh Wi-Fi.",
        milestone: "H-1",
        dueAt: null,
        state: "no-date" as const,
      },
    ];
    const onToggle = vi.fn();
    render(
      <TravelChecklist
        items={items}
        departureDate={null}
        daysUntil={null}
        progress={checklistProgress(items)}
        onSetDepartureDate={() => undefined}
        onToggle={onToggle}
      />,
    );
    expect(screen.getByLabelText("Tanggal keberangkatan")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith("install", true);
  });
});

describe("OfflineSnapshotBanner", () => {
  it("labels the cached copy with its age and refuses to call it live", () => {
    const snapshot = buildTravelSnapshot(order(), Date.now() - 60_000);
    render(<OfflineSnapshotBanner snapshot={snapshot} stale={false} />);
    expect(screen.getByText("Salinan offline tersimpan")).toBeInTheDocument();
    expect(screen.getByText(/1 menit lalu/)).toBeInTheDocument();
    expect(screen.getByText(/bukan status langsung/i)).toBeInTheDocument();
  });

  it("warns when the cached copy is old", () => {
    const snapshot = buildTravelSnapshot(order(), Date.now() - 40 * 24 * 3_600_000);
    render(<OfflineSnapshotBanner snapshot={snapshot} stale onClear={() => undefined} />);
    expect(screen.getByText("Salinan offline sudah lama")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hapus salinan/i })).toBeInTheDocument();
  });

  it("renders nothing without a cached copy", () => {
    const { container } = render(<OfflineSnapshotBanner snapshot={null} stale={false} />);
    expect(container.textContent).toBe("");
  });
});

describe("TravelSupportDialog", () => {
  it("previews the redacted payload and never exposes the QR or full ICCID", () => {
    const topics = supportTopicsFor("READY");
    const { unmount } = render(
      <TravelSupportDialog
        open
        onClose={() => undefined}
        topics={topics}
        supportBaseUrl="https://wa.me/6285156399831"
        contextFor={(topic) =>
          buildSupportContext({
            topic,
            status: "READY",
            orderId: ORDER_ID,
            orderCode: "DJW-ZZZZ9999",
            packageName: "Jepang 5GB",
            destination: "JP",
            iccid: "89852345678901234567",
            lastSyncedAt: null,
          })
        }
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    // FixedLayer portals the sheet into document.body, so assert on the real document.
    const text = document.body.textContent ?? "";
    expect(text).toContain("DJW-••••9999");
    expect(text).not.toContain("89852345678901234567");
    expect(text).not.toContain("SECRET-ACTIVATION");
    expect(text).not.toContain("LPA:");
    expect(screen.getByRole("button", { name: /Kirim ke support/i })).toBeInTheDocument();
    unmount();
  });

  it("renders nothing while closed", () => {
    const { container } = render(
      <TravelSupportDialog
        open={false}
        onClose={() => undefined}
        topics={supportTopicsFor("READY")}
        supportBaseUrl="https://wa.me/6285156399831"
        contextFor={(topic) =>
          buildSupportContext({
            topic,
            status: "READY",
            orderId: ORDER_ID,
            packageName: "Jepang 5GB",
            destination: "JP",
          })
        }
      />,
    );
    expect(container.textContent).toBe("");
  });
});
