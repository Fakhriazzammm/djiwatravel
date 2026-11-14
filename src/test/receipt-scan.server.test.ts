import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pool } from "@/db/client.server";
import {
  fetchFxRate,
  readReceiptPhoto,
  receiptScanStatus,
  saveScannedExpenses,
  scanReceipt,
  sniffImageMime,
} from "@/lib/receipt-scan.server";

vi.mock("@/db/client.server", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock("@/lib/admin-guard", () => ({ requireAdmin: vi.fn() }));
const consent = vi.hoisted(() => ({ block: null as string | null }));
vi.mock("@/lib/consent.server", () => ({ consentBlock: async () => consent.block }));
vi.mock("@/lib/admin-guard.server", () => ({
  getAdminEmailHandler: vi.fn(async () => "admin@x.test"),
}));

const query = vi.mocked(pool.query);
const connect = vi.mocked(pool.connect);
const USER = "user-1";
const TRIP = "11111111-1111-4111-8111-111111111111";
const SCAN = "22222222-2222-4222-8222-222222222222";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

type Row = Record<string, unknown>;
let config: Row | null = null;
let used = 0;
let sql: string[] = [];

function wireDb() {
  query.mockImplementation((async (text: string) => {
    sql.push(text);
    if (text.includes("from public.admin_settings"))
      return { rows: config ? [{ value_json: config, version: 1 }] : [] };
    if (text.includes("from public.travel_trips where id=")) return { rows: [{ id: TRIP }] };
    if (text.includes("count(*)::int as n")) return { rows: [{ n: used }] };
    if (text.includes("from public.travel_budget_categories"))
      return {
        rows: [
          { id: "cat-food", name: "Food & Drinks" },
          { id: "cat-shop", name: "Shopping" },
        ],
      };
    if (text.includes("insert into public.travel_receipt_scans")) return { rows: [{ id: SCAN }] };
    return { rows: [] };
  }) as never);
}

const answer = (body: Row, usage = { prompt_tokens: 2500, completion_tokens: 600 }) =>
  new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(body) } }], usage }),
    {
      status: 200,
    },
  );

const good = {
  is_receipt: true,
  readable: true,
  merchant: "Fuglen Tokyo",
  date: "2026-11-04",
  currency: "JPY",
  total: 1480,
  items: [
    { name: "Cold brew", amount: 680 },
    { name: "Cheesecake", amount: 800 },
  ],
  category_guess: "Food & Drinks",
  uncertain: [],
  region: null,
  reason: null,
};
const missing = {
  ...good,
  total: 1290,
  items: [
    { name: "Ramen", amount: 890 },
    { name: "Telur", amount: 280 },
  ],
};

beforeEach(() => {
  query.mockReset();
  connect.mockReset();
  config = null;
  used = 0;
  sql = [];
  consent.block = null;
  wireDb();
  vi.stubEnv("HELIPOD_AI_KEY", "hel_ai_test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("scanReceipt", () => {
  it("does not read the photo until the member agreed to the AI helper", async () => {
    consent.block =
      "Aktifkan “Asisten Travo (AI)” di Profil › Privasi & data untuk memakai fitur ini.";
    expect(await scanReceipt({ userId: USER, tripId: TRIP, bytes: JPEG })).toMatchObject({
      ok: false,
      code: "consent",
    });
  });

  it("stays unavailable without the AI key or when Admin turns it off", async () => {
    vi.stubEnv("HELIPOD_AI_KEY", "");
    expect(await scanReceipt({ userId: USER, tripId: TRIP, bytes: JPEG })).toMatchObject({
      ok: false,
      code: "disabled",
    });
    expect((await receiptScanStatus(USER)).available).toBe(false);
    vi.stubEnv("HELIPOD_AI_KEY", "k");
    config = { enabled: false };
    expect((await receiptScanStatus(USER)).available).toBe(false);
  });

  it("reads a receipt, matches the category, logs the cost and keeps the photo", async () => {
    const fetchMock = vi.fn(async () => answer(good));
    vi.stubGlobal("fetch", fetchMock);
    const result = await scanReceipt({
      userId: USER,
      tripId: TRIP,
      bytes: JPEG,
      now: new Date("2026-11-04T05:00:00Z"),
    });
    expect(result).toMatchObject({
      ok: true,
      scanId: SCAN,
      status: "ready",
      categoryId: "cat-food",
      photoStored: true,
      escalated: false,
      remaining: 29,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://ai.helipod.io/v1/chat/completions");
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer hel_ai_test");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("glm-5.3-flash");
    expect(body.response_format.type).toBe("json_schema");
    expect(JSON.stringify(body.messages)).toContain("data:image/jpeg;base64,");
    expect(sql.some((s) => s.includes("insert into public.travel_receipt_photos"))).toBe(true);
  });

  it("asks the stronger model once when the items do not add up and keeps the better answer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(answer(missing))
      .mockResolvedValueOnce(
        answer({ ...missing, items: [...missing.items, { name: "Nori", amount: 120 }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await scanReceipt({ userId: USER, tripId: TRIP, bytes: JPEG });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body))
        .model,
    ).toBe("glm-5.3-flashx");
    expect(result).toMatchObject({ ok: true, status: "ready", escalated: true });
  });

  it("marks the receipt for checking when even the stronger model cannot make it add up", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer(missing)),
    );
    const result = await scanReceipt({ userId: USER, tripId: TRIP, bytes: JPEG });
    expect(result).toMatchObject({ ok: true, status: "check", escalated: true });
    if (result.ok) expect(result.validation?.difference).toBe(120);
  });

  it("does not retry when Admin turned the stronger read off", async () => {
    config = { retryStrongModel: false };
    const fetchMock = vi.fn(async () => answer(missing));
    vi.stubGlobal("fetch", fetchMock);
    await scanReceipt({ userId: USER, tripId: TRIP, bytes: JPEG });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports unreadable and not-a-receipt without storing the photo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer({ ...good, readable: false, total: null })),
    );
    expect(await scanReceipt({ userId: USER, tripId: TRIP, bytes: JPEG })).toMatchObject({
      ok: true,
      status: "unreadable",
      photoStored: false,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer({ ...good, is_receipt: false })),
    );
    expect(await scanReceipt({ userId: USER, tripId: TRIP, bytes: JPEG })).toMatchObject({
      ok: true,
      status: "not_receipt",
      read: null,
    });
  });

  it("stops at the daily limit and rejects bad or oversized files", async () => {
    used = 30;
    vi.stubGlobal("fetch", vi.fn());
    expect(await scanReceipt({ userId: USER, tripId: TRIP, bytes: JPEG })).toMatchObject({
      ok: false,
      code: "limit",
      remaining: 0,
    });
    used = 0;
    expect(
      await scanReceipt({ userId: USER, tripId: TRIP, bytes: new Uint8Array([1, 2, 3]) }),
    ).toMatchObject({ ok: false, code: "bad_image" });
    config = { maxMb: 1 };
    const big = new Uint8Array(1024 * 1024 + 1);
    big.set(JPEG);
    expect(await scanReceipt({ userId: USER, tripId: TRIP, bytes: big })).toMatchObject({
      ok: false,
      code: "too_large",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("logs a failed AI call and tells the traveler to retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await scanReceipt({ userId: USER, tripId: TRIP, bytes: JPEG });
    expect(result).toMatchObject({ ok: false, code: "unavailable" });
    expect(
      sql.some(
        (s) => s.includes("insert into public.travel_receipt_scans") && s.includes("'error'"),
      ),
    ).toBe(true);
  });
});

describe("status, exchange rate, saving and photos", () => {
  it("shows the remaining scans today", async () => {
    used = 4;
    expect(await receiptScanStatus(USER)).toMatchObject({
      available: true,
      remaining: 26,
      dailyLimit: 30,
      maxPhotos: 10,
      savePhoto: true,
    });
  });

  it("looks up the ECB rate for the receipt date and caches it", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ date: "2026-11-03", rates: { IDR: 101.2 } })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const rate = await fetchFxRate({ from: "JPY", to: "IDR", date: "2026-11-03" });
    expect(rate).toEqual({ rate: 101.2, rateDate: "2026-11-03", source: "ECB via Frankfurter" });
    await fetchFxRate({ from: "JPY", to: "IDR", date: "2026-11-03" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown as unknown[])[0])).toBe(
      "https://api.frankfurter.dev/v1/2026-11-03?base=JPY&symbols=IDR",
    );
    expect(await fetchFxRate({ from: "IDR", to: "IDR" })).toMatchObject({ rate: 1 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 500 })),
    );
    expect(await fetchFxRate({ from: "KRW", to: "IDR", date: "2026-11-01" })).toBeNull();
  });

  it("saves reviewed scans as expenses in one transaction and links or drops the photo", async () => {
    const calls: string[] = [];
    const client = {
      query: vi.fn(async (text: string) => {
        calls.push(text);
        if (text.includes("from public.travel_receipt_scans")) return { rows: [{ id: SCAN }] };
        if (text.includes("insert into public.travel_expenses")) return { rows: [{ id: "exp-1" }] };
        if (text.includes("from public.travel_budget_categories"))
          return { rows: [{ id: "cat-food" }] };
        return { rows: [] };
      }),
      release: vi.fn(),
    };
    connect.mockResolvedValue(client as never);
    const input = {
      tripId: TRIP,
      items: [
        {
          scanId: SCAN,
          description: "Fuglen Tokyo",
          transactionDate: "2026-11-04",
          originalAmountMinor: 148000,
          originalCurrency: "JPY",
          exchangeRate: 101.2,
          exchangeRateSource: "ECB via Frankfurter 2026-11-03",
          convertedAmountMinor: 14977600,
          convertedCurrency: "IDR",
          categoryId: "33333333-3333-4333-8333-333333333333",
          edited: true,
          keepPhoto: true,
        },
      ],
    };
    const { saveScannedInput } = await import("@/lib/receipt-scan.server");
    const result = await saveScannedExpenses(USER, saveScannedInput(input));
    expect(result).toEqual({ expenseIds: ["exp-1"] });
    expect(calls[0]).toBe("begin");
    expect(calls.at(-1)).toBe("commit");
    expect(
      calls.some((c) => c.includes("update public.travel_receipt_photos set expense_id")),
    ).toBe(true);
    expect(client.release).toHaveBeenCalled();

    calls.length = 0;
    await saveScannedExpenses(
      USER,
      saveScannedInput({ ...input, items: [{ ...input.items[0], keepPhoto: false }] }),
    );
    expect(calls.some((c) => c.includes("delete from public.travel_receipt_photos"))).toBe(true);
  });

  it("refuses a scan that was already saved or belongs to someone else", async () => {
    const client = {
      query: vi.fn(async (text: string) =>
        text.includes("from public.travel_receipt_scans") ? { rows: [] } : { rows: [] },
      ),
      release: vi.fn(),
    };
    connect.mockResolvedValue(client as never);
    const { saveScannedInput } = await import("@/lib/receipt-scan.server");
    await expect(
      saveScannedExpenses(
        USER,
        saveScannedInput({
          tripId: TRIP,
          items: [
            {
              scanId: SCAN,
              description: "x",
              transactionDate: "2026-11-04",
              originalAmountMinor: 100,
              originalCurrency: "IDR",
              convertedAmountMinor: 100,
              convertedCurrency: "IDR",
            },
          ],
        }),
      ),
    ).rejects.toThrow("Struk sudah disimpan");
    expect(client.query).toHaveBeenCalledWith("rollback");
  });

  it("serves a photo only through the trip owner and rejects odd ids", async () => {
    query.mockResolvedValueOnce({
      rows: [{ mime: "image/jpeg", bytes: Buffer.from([1]) }],
    } as never);
    expect(await readReceiptPhoto(USER, SCAN)).toMatchObject({ mime: "image/jpeg" });
    expect(String(query.mock.calls[0]?.[0])).toContain("t.customer_auth_subject=$2");
    expect(await readReceiptPhoto(USER, "not-a-uuid")).toBeNull();
  });

  it("recognises image types by their first bytes", () => {
    expect(sniffImageMime(JPEG)).toBe("image/jpeg");
    expect(sniffImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
    expect(sniffImageMime(new Uint8Array([0, 0, 0]))).toBeNull();
  });
});
