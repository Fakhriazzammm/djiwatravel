import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminReceiptScanPanel } from "@/components/admin-receipt-scan-panel";
import { saveAdminReceiptScan } from "@/lib/receipt-scan.fn";
import { DEFAULT_RECEIPT_SCAN_CONFIG } from "@/lib/receipt-scan";

vi.mock("@/lib/receipt-scan.fn", () => ({
  saveAdminReceiptScan: vi.fn(async () => ({ ok: true, conflict: false, version: 4 })),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const stats = {
  scans: 1248,
  needsCheckPercent: 7.4,
  editedPercent: 11,
  costIdr: 21000,
  saved: 900,
};

describe("Admin panel: Scan struk pengeluaran", () => {
  it("shows the switches, limits, model and the 30-day numbers", () => {
    render(
      <AdminReceiptScanPanel
        initial={DEFAULT_RECEIPT_SCAN_CONFIG}
        version={3}
        stats={stats}
        aiConfigured
      />,
    );
    expect(screen.getByLabelText("Batas scan per hari")).toHaveValue("30");
    expect(screen.getByLabelText("Maksimal foto per scan")).toHaveValue("10");
    expect(screen.getByLabelText("Ukuran foto maksimal")).toHaveValue("6");
    expect(screen.getByLabelText("Model pembaca")).toHaveValue("glm-5.3-flash");
    expect(screen.getByText("Simpan foto struk")).toBeInTheDocument();
    expect(screen.getByText("1.248")).toBeInTheDocument();
    expect(screen.getByText("7,4%")).toBeInTheDocument();
    expect(screen.getByText("Rp 21.000")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("warns when the AI key is missing on the server", () => {
    render(
      <AdminReceiptScanPanel
        initial={DEFAULT_RECEIPT_SCAN_CONFIG}
        version={0}
        stats={stats}
        aiConfigured={false}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("HELIPOD_AI_KEY");
  });

  it("saves with a reason and the current version", async () => {
    render(
      <AdminReceiptScanPanel
        initial={DEFAULT_RECEIPT_SCAN_CONFIG}
        version={3}
        stats={stats}
        aiConfigured
      />,
    );
    fireEvent.change(screen.getByLabelText("Batas scan per hari"), { target: { value: "50" } });
    fireEvent.click(screen.getAllByRole("checkbox")[1]!);
    expect(screen.getByText("Simpan pengaturan")).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByPlaceholderText(/Contoh: menaikkan/), {
      target: { value: "musim liburan" },
    });
    fireEvent.click(screen.getByText("Simpan pengaturan"));
    await waitFor(() => expect(saveAdminReceiptScan).toHaveBeenCalledTimes(1));
    const call = (vi.mocked(saveAdminReceiptScan).mock.calls[0]![0] as unknown as { data: unknown })
      .data as {
      config: { dailyLimit: number };
      reason: string;
      expectedVersion: number;
    };
    expect(call).toMatchObject({ reason: "musim liburan", expectedVersion: 3 });
    expect(call.config.dailyLimit).toBe(50);
    expect((call.config as unknown as { savePhoto: boolean }).savePhoto).toBe(false);
    expect((call.config as unknown as { savePhoto: boolean }).savePhoto).toBe(false);
    expect(await screen.findByText(/dicatat di audit log/)).toBeInTheDocument();
  });

  it("refuses an out-of-range limit before calling the server", async () => {
    render(
      <AdminReceiptScanPanel
        initial={DEFAULT_RECEIPT_SCAN_CONFIG}
        version={1}
        stats={stats}
        aiConfigured
      />,
    );
    fireEvent.change(screen.getByLabelText("Batas scan per hari"), { target: { value: "0" } });
    fireEvent.change(screen.getByPlaceholderText(/Contoh: menaikkan/), {
      target: { value: "uji" + "coba" },
    });
    fireEvent.click(screen.getByText("Simpan pengaturan"));
    expect((await screen.findByRole("alert")).textContent).toContain("dailyLimit");
    expect(saveAdminReceiptScan).not.toHaveBeenCalled();
  });
});
