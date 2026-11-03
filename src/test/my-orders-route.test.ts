import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("customer order list (/my-orders)", () => {
  const page = read("src/routes/my-orders.tsx");

  it("lists the customer's own orders from the shared order source, newest first", () => {
    expect(page).toContain("useOrders()");
    expect(page).toContain("b.createdAt - a.createdAt");
  });

  it("opens each order's detail page rather than the guest status lookup", () => {
    expect(page).toContain('to="/order/$id"');
    expect(page).not.toContain("/order-status");
  });

  it("has a loading state and an empty state with a way to start a purchase", () => {
    expect(page).toContain("Memuat pesanan");
    expect(page).toContain("Belum ada pesanan");
    expect(page).toContain('to="/explore"');
  });

  it("is the destination of both profile order entry points", () => {
    expect(read("src/components/profile/profile-service-grid.tsx")).toContain(
      'orders: "/my-orders"',
    );
    expect(read("src/routes/profile.tsx")).toContain('to="/my-orders"');
  });
});
