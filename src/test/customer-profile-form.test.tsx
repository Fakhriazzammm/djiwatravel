import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CustomerProfileForm } from "@/components/customer-profile-form";

describe("customer profile form", () => {
  it("shows grouped traveler sections and keeps account email read-only", () => {
    render(
      <CustomerProfileForm
        profile={{
          email: "traveler@example.com",
          whatsapp: "6281234567890",
          displayName: "Rani Putri",
          nationality: "Indonesia",
          dateOfBirth: "1995-04-12",
          gender: "female",
        }}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        saving={false}
        saveLabel="Simpan data"
        error={null}
        canCancel
      />,
    );

    expect(screen.getByRole("heading", { name: "Akun" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Kontak" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Data traveler" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email akun")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Nama lengkap")).toHaveValue("Rani Putri");
  });

  it("submits and exposes cancel without hiding the primary action", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    render(
      <CustomerProfileForm
        profile={{ email: "traveler@example.com", whatsapp: "6281234567890" }}
        onChange={vi.fn()}
        onSubmit={onSubmit}
        onCancel={onCancel}
        saving={false}
        saveLabel="Simpan data"
        error={null}
        canCancel
      />,
    );

    fireEvent.submit(screen.getByRole("button", { name: "Simpan data" }).closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: "Batal" }));
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
