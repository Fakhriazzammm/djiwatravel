import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach } from "vitest";
import { DEFAULT_SHIPPING_CONFIG, type ShippingConfig } from "@/lib/shipping";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/shell", () => ({
  Page: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  BackBar: ({ title, action }: { title?: string; action?: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {action}
    </div>
  ),
}));
vi.mock("@/components/customer-auth", () => ({
  CustomerAuth: () => <button type="button">Masuk atau daftar</button>,
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
// jsdom has no image decoding: the photo "shrinking" step just hands the file back.
vi.mock("@/lib/receipt-image", () => ({ compressReceiptPhoto: async (file: Blob) => file }));
vi.stubGlobal(
  "URL",
  Object.assign(URL, { createObjectURL: () => "blob:test", revokeObjectURL: () => undefined }),
);

import { ShippingBookingForm } from "@/components/shipping/shipping-booking-form";

const open: ShippingConfig = { ...DEFAULT_SHIPPING_CONFIG, enabled: true };

afterEach(cleanup);

async function addPhoto(name = "isi.jpg") {
  const file = new File([new Uint8Array(20)], name, { type: "image/jpeg" });
  fireEvent.change(screen.getByLabelText("Pilih foto dari galeri"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getAllByAltText("Foto isi paket").length).toBeGreaterThan(0));
  return file;
}

function fillRecipient() {
  fireEvent.change(screen.getByLabelText("Nama penerima"), { target: { value: "Rina Tanaka" } });
  fireEvent.change(screen.getByLabelText("Nomor telepon (+81)"), {
    target: { value: "+81 90 1234 5678" },
  });
  fireEvent.change(screen.getByLabelText("Kode pos"), { target: { value: "1500002" } });
  fireEvent.change(screen.getByLabelText("Prefektur"), { target: { value: "Tokyo" } });
  fireEvent.change(screen.getByLabelText("Kota / kelurahan"), { target: { value: "Shibuya-ku" } });
  fireEvent.change(screen.getByLabelText("Alamat lengkap"), {
    target: { value: "2-21-1 Shibuya, Apt 302" },
  });
}

describe("ShippingBookingForm", () => {
  it("is closed while Admin has the service off", () => {
    render(
      <ShippingBookingForm
        config={DEFAULT_SHIPPING_CONFIG}
        available={false}
        signedIn
        last={null}
        onSubmit={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
    expect(screen.getByText("Kirim Barang belum dibuka.")).toBeTruthy();
  });

  it("walks recipient, goods and summary, and submits the booking", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: "00000000-0000-4000-8000-000000000042" });
    const onCreated = vi.fn();
    render(
      <ShippingBookingForm
        config={open}
        available
        signedIn
        last={null}
        onSubmit={onSubmit}
        onCreated={onCreated}
      />,
    );

    // Step 1 refuses an empty form and shows why.
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    expect(screen.getByText("Nama penerima wajib diisi")).toBeTruthy();
    fillRecipient();
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));

    // Step 2: weight stepper drives the estimate (2 kg x Rp150.000, then 2,5 kg).
    expect(screen.getByRole("heading", { name: "Barang" })).toBeTruthy();
    expect(screen.getByText("Rp300.000")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tambah berat" }));
    expect(screen.getByText("2,5 kg")).toBeTruthy();
    expect(screen.getByText("Rp375.000")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Lihat ringkasan" }));
    expect(screen.getByText("Pilih kategori barang")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Makanan kering" }));
    fireEvent.change(screen.getByLabelText("Isi paket"), {
      target: { value: "Keripik, kopi bubuk, 2 kaos" },
    });
    fireEvent.change(screen.getByLabelText(/Nilai barang/), { target: { value: "650.000" } });

    // The rules agreement and the proof photo are both required.
    fireEvent.click(screen.getByRole("button", { name: "Lihat ringkasan" }));
    expect(screen.getByText("Setujui daftar barang terlarang dulu")).toBeTruthy();
    expect(screen.getByText("Lampirkan minimal 1 foto isi paket")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Setujui daftar barang terlarang" }));
    fireEvent.click(screen.getByRole("button", { name: "Lihat ringkasan" }));
    expect(screen.getByRole("heading", { name: "Barang" })).toBeTruthy(); // still on the goods step
    const photo = await addPhoto("semua-barang.jpg");
    fireEvent.click(screen.getByRole("button", { name: "Lihat ringkasan" }));

    // Step 3: summary, drop point and the bill-after-weighing promise.
    expect(screen.getByRole("heading", { name: "Ringkasan" })).toBeTruthy();
    expect(screen.getByText("setelah ditimbang")).toBeTruthy();
    expect(screen.getByText("1 foto")).toBeTruthy();
    expect(screen.getByText(/Jl\. Bojong Tengah No\. 34/)).toBeTruthy();
    expect(screen.getByText(/Antar maksimal 7 hari/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Kirim booking" }));
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000042"),
    );
    expect(onSubmit.mock.calls[0]![1]).toEqual([expect.any(File)]);
    expect(onSubmit.mock.calls[0]![1][0].name).toMatch(/^foto-/);
    expect(photo.type).toBe("image/jpeg");
    expect(onSubmit.mock.calls[0]![0]).toEqual({
      country: "JP",
      recipient: {
        recipientName: "Rina Tanaka",
        phone: "+81 90 1234 5678",
        postalCode: "1500002",
        prefecture: "Tokyo",
        city: "Shibuya-ku",
        addressLine: "2-21-1 Shibuya, Apt 302",
      },
      goods: {
        category: "Makanan kering",
        contents: "Keripik, kopi bubuk, 2 kaos",
        declaredValueIdr: 650000,
        estimatedKg: 2.5,
      },
      acceptedRules: true,
      inbound: { mode: "SELF" },
    });
  });

  it("asks for the inbound courier and receipt when the parcel comes by courier", async () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: "x" });
    render(
      <ShippingBookingForm
        config={open}
        available
        signedIn
        last={{
          recipientName: "Rina Tanaka",
          phone: "+819012345678",
          postalCode: "150-0002",
          prefecture: "Tokyo",
          city: "Shibuya-ku",
          addressLine: "2-21-1 Shibuya, Apt 302",
        }}
        onSubmit={onSubmit}
        onCreated={vi.fn()}
      />,
    );
    // The previous recipient is prefilled, so step 1 passes straight away.
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    fireEvent.click(screen.getByRole("button", { name: "Pakaian" }));
    fireEvent.change(screen.getByLabelText("Isi paket"), { target: { value: "2 kaos" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Setujui daftar barang terlarang" }));
    await addPhoto();
    fireEvent.click(screen.getByRole("button", { name: "Lihat ringkasan" }));

    fireEvent.click(screen.getByRole("button", { name: "Lewat kurir" }));
    fireEvent.click(screen.getByRole("button", { name: "Kirim booking" }));
    expect(screen.getByText("Tulis nama kurir")).toBeTruthy();
    expect(screen.getByText("Tulis nomor resi")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Nama kurir"), { target: { value: "JNE" } });
    fireEvent.change(screen.getByLabelText("Nomor resi"), { target: { value: "JNE123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Kirim booking" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]![0].inbound).toEqual({
      mode: "COURIER",
      courier: "JNE",
      tracking: "JNE123456",
    });
  });

  it("shows the how-to-photograph guide and lets the customer remove a photo", async () => {
    render(
      <ShippingBookingForm
        config={open}
        available
        signedIn
        last={{
          recipientName: "Rina Tanaka",
          phone: "+819012345678",
          postalCode: "150-0002",
          prefecture: "Tokyo",
          city: "Shibuya-ku",
          addressLine: "2-21-1 Shibuya, Apt 302",
        }}
        onSubmit={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    fireEvent.click(screen.getByRole("button", { name: "Lihat contoh" }));
    expect(await screen.findByText("Cara memotret isi paket")).toBeTruthy();
    expect(screen.getByRole("img", { name: /semua barang dijejer satu lapis/i })).toBeTruthy();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    await addPhoto("a.jpg");
    await addPhoto("b.jpg");
    expect(screen.getAllByAltText("Foto isi paket")).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Hapus foto" })[0]!);
    expect(screen.getAllByAltText("Foto isi paket")).toHaveLength(1);
  });

  it("does not ask for a photo when Admin sets the minimum to 0", () => {
    render(
      <ShippingBookingForm
        config={{ ...open, minPhotos: 0 }}
        available
        signedIn
        last={null}
        onSubmit={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
    fillRecipient();
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    expect(screen.getByText("Foto isi paket")).toBeTruthy();
    expect(screen.queryByText(/wajib, minimal/)).toBeNull();
  });

  it("asks a signed-out visitor to sign in before booking", async () => {
    render(
      <ShippingBookingForm
        config={open}
        available
        signedIn={false}
        last={null}
        onSubmit={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
    expect(screen.getByRole("heading", { name: "Penerima" })).toBeTruthy();
    fillRecipient();
    fireEvent.click(screen.getByRole("button", { name: "Lanjut" }));
    fireEvent.click(screen.getByRole("button", { name: "Pakaian" }));
    fireEvent.change(screen.getByLabelText("Isi paket"), { target: { value: "2 kaos" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Setujui daftar barang terlarang" }));
    await addPhoto();
    fireEvent.click(screen.getByRole("button", { name: "Lihat ringkasan" }));
    expect(screen.getByText("Masuk dulu untuk membuat booking.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Kirim booking" })).toBeNull();
  });
});
