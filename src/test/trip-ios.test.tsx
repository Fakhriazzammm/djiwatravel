import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog, TripActionSheet } from "@/components/trip-ios";

afterEach(cleanup);

describe("trip iOS controls", () => {
  it("confirms in-app without window.confirm", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Hapus perjalanan?"
        description="Data dihapus."
        confirmLabel="Hapus"
        destructive
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Hapus" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("runs an action sheet item and closes the sheet", () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <TripActionSheet
        open
        onOpenChange={onOpenChange}
        title="Bali"
        actions={[{ label: "Bagikan perjalanan", onSelect }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Bagikan perjalanan" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("trip pages never rely on window.confirm", () => {
    for (const file of [
      "src/routes/my-trips.$tripId.tsx",
      "src/routes/my-trips.$tripId.$section.tsx",
    ]) {
      expect(readFileSync(file, "utf8")).not.toContain("window.confirm");
    }
  });
});
