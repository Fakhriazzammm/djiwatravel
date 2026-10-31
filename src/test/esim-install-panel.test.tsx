import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EsimInstallPanel } from "@/components/esim-install";

const esim = {
  iccid: "8985000000000000000",
  smdp: "smdp.example.com",
  activationCode: "ABCD-1234",
  lpa: "LPA:1$smdp.example.com$ABCD-1234",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EsimInstallPanel", () => {
  it("offers one-tap install on an iPhone and keeps the QR as fallback", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)",
    });
    render(<EsimInstallPanel esim={esim} />);
    const link = await screen.findByRole("link", { name: /Pasang langsung/ });
    expect(link).toHaveAttribute(
      "href",
      "https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA:1$smdp.example.com$ABCD-1234",
    );
    expect(screen.getByText(/Scan QR ini/)).toBeInTheDocument();
  });

  it("shows only the QR on desktop", () => {
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)" });
    render(<EsimInstallPanel esim={esim} />);
    expect(screen.queryByRole("link", { name: /Pasang langsung/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Scan QR ini/)).toBeInTheDocument();
  });

  it("offers device-specific guidance and safe troubleshooting", () => {
    render(<EsimInstallPanel esim={esim} withGuide />);
    fireEvent.click(screen.getByRole("button", { name: "Pixel" }));
    expect(screen.getByText(/Jaringan & internet/i)).toBeInTheDocument();
    expect(screen.getByText(/masa aktif.*tergantung paket/i)).toBeInTheDocument();
    expect(screen.getByText(/jangan hapus eSIM/i)).toBeInTheDocument();
    expect(screen.getByText(/tidak ada internet/i)).toBeInTheDocument();
  });
});
