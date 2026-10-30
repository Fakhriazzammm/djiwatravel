import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTrip } from "@/lib/my-trips.fn";
import { Route } from "@/routes/my-trips.$tripId";

vi.mock("@/lib/my-trips.fn", () => ({
  getTrip: vi.fn(),
  patchTrip: vi.fn(),
}));

const loadTrip = vi.mocked(getTrip);

describe("My Trip detail authentication boundary", () => {
  beforeEach(() => loadTrip.mockReset());

  it("redirects to Profile when the detail loader has an expired session", async () => {
    loadTrip.mockRejectedValueOnce(new Error("Autentikasi diperlukan"));

    const loader = Route.options.loader as (context: unknown) => Promise<unknown>;

    await expect(
      loader({
        params: { tripId: "11111111-1111-4111-8111-111111111111" },
        location: { href: "/my-trips/11111111-1111-4111-8111-111111111111" },
      }),
    ).rejects.toMatchObject({ options: { to: "/profile" } });
  });
});
