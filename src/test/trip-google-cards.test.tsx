import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TripGoogleCards } from "@/components/trip-google-cards";

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

const status = {
  configured: true,
  googleConnected: true,
  accountEmail: "budi@gmail.com",
  features: { calendar: true, drive: true, sheets: true },
  driveEnabled: true,
  drive: { pending: 0, uploaded: 0, failed: 0, revoked: 0 },
  sheets: { pending: 0, failed: 0, revoked: 0 },
  needsReconnect: false,
};

const oldSync = new Date(Date.now() - 3_600_000).toISOString();
const exportOf = (over = {}) => ({
  status: "synced",
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/x",
  lastSyncedAt: oldSync,
  error: null,
  report: null,
  ...over,
});

function mockFetch(handlers: { get?: () => unknown; post?: () => unknown }) {
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, ...(init?.body ? { body: init.body } : {}) });
      const json = (value: unknown) => ({ ok: true, json: async () => value });
      if (url.includes("/api/google-calendar/status")) return json(status);
      if (url.includes("/api/google-sheets") && method === "GET")
        return json(handlers.get?.() ?? { export: exportOf(), folderUrl: null });
      if (url.includes("/api/google-sheets") && method === "POST")
        return json(handlers.post?.() ?? { changed: false, export: exportOf(), folderUrl: null });
      return { ok: false, json: async () => ({}) };
    }),
  );
  return calls;
}

beforeEach(() => vi.stubGlobal("matchMedia", undefined));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Trip Google cards: two-way Sheets", () => {
  it("looks at the sheet when the page opens and reloads the lists when the sheet changed the app", async () => {
    const calls = mockFetch({
      post: () => ({
        changed: true,
        export: exportOf({ lastSyncedAt: new Date().toISOString() }),
        folderUrl: null,
      }),
    });
    const onChanged = vi.fn(async () => {});
    render(<TripGoogleCards tripId="t1" showDrive={false} onChanged={onChanged} />);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(calls.some((c) => c.method === "POST" && c.body?.includes('"action":"sync"'))).toBe(
      true,
    );
  });

  it("does not reload the lists when nothing came in from the sheet", async () => {
    mockFetch({
      post: () => ({
        changed: false,
        export: exportOf({ lastSyncedAt: new Date().toISOString() }),
        folderUrl: null,
      }),
    });
    const onChanged = vi.fn(async () => {});
    render(<TripGoogleCards tripId="t1" showDrive={false} onChanged={onChanged} />);
    await screen.findByText(/Dua arah/);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("does not sync again when it synced a moment ago", async () => {
    const calls = mockFetch({
      get: () => ({
        export: exportOf({ lastSyncedAt: new Date().toISOString() }),
        folderUrl: null,
      }),
    });
    render(<TripGoogleCards tripId="t1" showDrive={false} />);
    await screen.findByText(/Dua arah/);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("shows what the sheet could not use: unreadable rows, clashes and held deletions", async () => {
    mockFetch({
      get: () => ({
        export: exportOf({
          lastSyncedAt: new Date().toISOString(),
          report: {
            conflicts: 2,
            heldDeletions: 7,
            issueCount: 4,
            issues: [{ tab: "Pengeluaran", row: 5, reason: "Jumlah harus angka lebih dari 0." }],
          },
        }),
        folderUrl: null,
      }),
    });
    render(<TripGoogleCards tripId="t1" showDrive={false} />);
    const report = await screen.findByTestId("sheet-report");
    expect(report).toHaveTextContent("Baris 5 di Pengeluaran: Jumlah harus angka lebih dari 0.");
    expect(report).toHaveTextContent("+3 masalah lain");
    expect(report).toHaveTextContent("2 perubahan bentrok");
    expect(report).toHaveTextContent("7 penghapusan baris ditahan");
  });

  it("has a button to sync right now", async () => {
    mockFetch({
      get: () => ({
        export: exportOf({ lastSyncedAt: new Date().toISOString() }),
        folderUrl: null,
      }),
    });
    render(<TripGoogleCards tripId="t1" showDrive={false} />);
    expect(await screen.findByRole("button", { name: "Sinkronkan sekarang" })).toBeInTheDocument();
  });
});
