import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DeviceCompatibility } from "@/components/device-compatibility";

afterEach(cleanup);

describe("DeviceCompatibility", () => {
  it("helps customers check their device without claiming automatic verification", () => {
    render(<DeviceCompatibility />);
    fireEvent.click(screen.getByRole("button", { name: "Cek" }));
    fireEvent.click(screen.getByRole("button", { name: "Samsung" }));
    expect(screen.getByText(/Manajer SIM/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/mendukung eSIM/i));
    fireEvent.click(screen.getByLabelText(/tidak terkunci operator/i));
    expect(screen.getByText(/belum memverifikasi kompatibilitas/i)).toBeInTheDocument();
  });
});
