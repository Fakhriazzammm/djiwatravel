import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), "src", path), "utf8");

describe("admin orders customer/detail interaction contract", () => {
  it("uses member profile identity with guest fallback for list and detail", () => {
    const source = read("lib/admin-read-model.server.ts");
    expect(source).toContain("public.customer_profiles cp");
    expect(source).toContain("coalesce(cp.email, a.email) as customer_email");
    expect(source).toContain("coalesce(cp.whatsapp, a.whatsapp) as customer_whatsapp");
    expect(source).toContain("cp.auth_user_id = o.customer_auth_subject");
  });

  it("makes desktop rows and mobile cards real navigable targets", () => {
    const source = read("routes/admin.orders.tsx");
    expect(source).toContain("useNavigate");
    expect(source).toContain("onClick={() => openOrder(order.detailHref)}");
    expect(source).toContain('role="link"');
    expect(source).toContain("to={order.detailHref as never}");
  });

  it("keeps the detail sheet controlled and closable", () => {
    const source = read("components/admin-shell.tsx");
    expect(source).toContain("if (!open) return null");
    expect(source).toContain('aria-label="Tutup detail"');
    expect(source).toContain("onClick={onClose}");
  });
});
