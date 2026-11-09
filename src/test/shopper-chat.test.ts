import { describe, expect, it } from "vitest";
import {
  chatStage,
  cleanMessage,
  formatCountdown,
  isOpenAt,
  linkify,
  messagePreview,
  messageProblem,
  nameFromEmail,
  offerState,
  quickReplies,
  replyPromise,
  responseDueAt,
  suggestedFee,
  threadTitle,
} from "@/lib/shopper-chat";
import { discoveryConfigSchema } from "@/lib/shopper-discovery";

// Times in WIB (UTC+7) written as UTC so the arithmetic is easy to read: 10:00 WIB = 03:00Z.
const wib = (h: number, m = 0, day = 9) => new Date(Date.UTC(2026, 10, day, h - 7, m));

describe("chatStage", () => {
  const stage = (
    requestStatus: string | null,
    orderStatus: Parameters<typeof chatStage>[0]["orderStatus"] = null,
    kind: "REQUEST" | "ORDER" = "REQUEST",
  ) => chatStage({ kind, requestStatus, orderStatus });

  it("walks Dikirim, Dicari, Penawaran, Bayar", () => {
    expect(stage("SUBMITTED")).toMatchObject({ done: 0, label: "Baru", waitingOn: "team" });
    expect(stage("SEARCHING")).toMatchObject({ done: 1, label: "Dicari", waitingOn: "team" });
    expect(stage("NEEDS_INFO")).toMatchObject({ done: 1, waitingOn: "customer" });
    expect(stage("OFFERED")).toMatchObject({ done: 2, label: "Penawaran", waitingOn: "customer" });
    expect(stage("ORDERED", "PAYMENT_PENDING")).toMatchObject({ done: 3, waitingOn: "payment" });
    expect(stage("ORDERED", "PAID")).toMatchObject({ done: 4, tone: "ok", closed: false });
    expect(stage("ORDERED", "DELIVERED")).toMatchObject({ done: 4, closed: true });
  });

  it("marks stopped requests as closed", () => {
    for (const s of ["DECLINED", "UNAVAILABLE", "CANCELLED"])
      expect(stage(s)).toMatchObject({ closed: true, waitingOn: "none" });
    expect(stage("ORDERED", "EXPIRED")).toMatchObject({ closed: true, tone: "bad" });
    expect(stage("ORDERED", "CANCELLED")).toMatchObject({ closed: true });
  });

  it("treats an order thread as fully on its way", () => {
    expect(stage(null, "SHIPPED", "ORDER")).toMatchObject({ done: 4, label: "Pesanan" });
  });
});

describe("quickReplies", () => {
  const replies = (
    rs: string | null,
    os: Parameters<typeof chatStage>[0]["orderStatus"] = null,
    kind: "REQUEST" | "ORDER" = "REQUEST",
  ) => quickReplies(chatStage({ kind, requestStatus: rs, orderStatus: os }), kind);
  it("fits the moment", () => {
    expect(replies("OFFERED")).toEqual(["Tanya warna", "Ada yang lebih murah?", "Setuju"]);
    expect(replies("SEARCHING")).toContain("Kirim foto lain");
    expect(replies("ORDERED", "PAID")).toContain("Kapan barang sampai?");
    expect(replies(null, "SHIPPED", "ORDER")).toContain("Minta nomor resi");
    expect(replies("ORDERED", "PAYMENT_PENDING")).toContain("Bagaimana cara bayar?");
    expect(replies("UNAVAILABLE")).toContain("Coba cari lagi");
  });
});

describe("offerState", () => {
  const base = {
    cardRequestVersion: 4,
    isLatest: true,
    requestStatus: "OFFERED",
    requestVersion: 4,
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    orderStatus: null,
    hasOrder: false,
  } as const;
  it("is open until it expires, and older cards are superseded", () => {
    expect(offerState(base)).toBe("open");
    expect(offerState({ ...base, expiresAt: new Date(Date.now() - 1000).toISOString() })).toBe(
      "expired",
    );
    expect(offerState({ ...base, isLatest: false })).toBe("superseded");
  });
  it("follows the request and the order", () => {
    expect(offerState({ ...base, requestStatus: "DECLINED" })).toBe("declined");
    expect(offerState({ ...base, requestStatus: "UNAVAILABLE" })).toBe("closed");
    expect(
      offerState({
        ...base,
        requestStatus: "ORDERED",
        hasOrder: true,
        orderStatus: "PAYMENT_PENDING",
      }),
    ).toBe("accepted");
    expect(
      offerState({ ...base, requestStatus: "ORDERED", hasOrder: true, orderStatus: "PURCHASED" }),
    ).toBe("paid");
    expect(
      offerState({ ...base, requestStatus: "ORDERED", hasOrder: true, orderStatus: "EXPIRED" }),
    ).toBe("closed");
  });
});

describe("opening hours and the reply target", () => {
  it("knows when the team is open (WIB)", () => {
    expect(isOpenAt(wib(10), 9, 21)).toBe(true);
    expect(isOpenAt(wib(9), 9, 21)).toBe(true);
    expect(isOpenAt(wib(21), 9, 21)).toBe(false);
    expect(isOpenAt(wib(3), 9, 21)).toBe(false);
  });

  it("counts the target from the message while open", () => {
    expect(responseDueAt(wib(10), 15, 9, 21).toISOString()).toBe(wib(10, 15).toISOString());
  });

  it("starts the clock at the next opening when closed", () => {
    expect(responseDueAt(wib(23), 15, 9, 21).toISOString()).toBe(wib(9, 15, 10).toISOString());
    expect(responseDueAt(wib(6), 15, 9, 21).toISOString()).toBe(wib(9, 15, 9).toISOString());
  });

  it("carries unused minutes past closing into the next morning", () => {
    // 20:50 + 15 min: 10 minutes left today, 5 minutes after opening tomorrow.
    expect(responseDueAt(wib(20, 50), 15, 9, 21).toISOString()).toBe(wib(9, 5, 10).toISOString());
  });

  it("formats the countdown and the promise", () => {
    expect(formatCountdown(0)).toBe("Terlambat");
    expect(formatCountdown(-5000)).toBe("Terlambat");
    expect(formatCountdown(11 * 60_000 + 42_000)).toBe("11:42");
    expect(formatCountdown(23 * 3_600_000 + 40 * 60_000)).toBe("23:40");
    expect(replyPromise({ now: wib(10), openHour: 9, closeHour: 21, targetMinutes: 15 })).toContain(
      "rata-rata 15 mnt",
    );
    expect(replyPromise({ now: wib(23), openHour: 9, closeHour: 21, targetMinutes: 15 })).toContain(
      "di luar jam layanan",
    );
  });
});

describe("messages", () => {
  it("cleans control characters and long blank runs", () => {
    expect(cleanMessage("  halo\u0000\r\n\r\n\r\n\r\ndunia  ")).toBe("halo\n\ndunia");
  });

  it("rejects long text, many links and plain http", () => {
    expect(messageProblem("a".repeat(2001))).toMatch(/maksimal/);
    expect(messageProblem("https://a.id https://b.id https://c.id https://d.id")).toMatch(
      /Maksimal/,
    );
    expect(messageProblem("lihat http://toko.example/a")).toMatch(/HTTPS/);
    expect(messageProblem("lihat https://jp.mercari.com/item/m1 ya")).toBeNull();
  });

  it("makes only https links clickable and trims trailing punctuation", () => {
    const parts = linkify("cek https://jp.mercari.com/item/m1, lalu javascript:alert(1)");
    expect(parts.filter((p) => p.href)).toEqual([
      { text: "https://jp.mercari.com/item/m1", href: "https://jp.mercari.com/item/m1" },
    ]);
    expect(parts.map((p) => p.text).join("")).toContain("javascript:alert(1)");
  });

  it("previews text, offers and photos", () => {
    expect(messagePreview({ body: "  halo   dunia " })).toBe("halo dunia");
    expect(messagePreview({ body: "", hasPhoto: true })).toBe("Foto");
    expect(
      messagePreview({
        body: "",
        card: {
          type: "offer",
          requestId: "r",
          number: 2,
          requestVersion: 3,
          expiresAt: new Date().toISOString(),
          offer: {
            name: "x",
            merchant: "y",
            productUrl: "https://a.id",
            condition: "c",
            variant: "v",
            quantity: 1,
            unitIdr: 100,
            unitJpy: 1,
            rateIdr: 100,
            domesticIdr: 50,
            feeIdr: 10,
            shippingIdr: 40,
            note: "",
          },
        },
      }),
    ).toBe("Penawaran 2 siap, total Rp 200");
  });
});

describe("naming and money", () => {
  it("names threads and customers", () => {
    expect(threadTitle({ offerName: "Wool jacket" })).toBe("Wool jacket");
    expect(threadTitle({ note: "  poster   くら寿司 " })).toBe("poster くら寿司");
    expect(threadTitle({ sourceUrl: "https://jp.mercari.com/item/m1" })).toBe(
      "Link jp.mercari.com",
    );
    expect(threadTitle({})).toBe("Barang incaran dari Jepang");
    expect(nameFromEmail("budi.santoso@gmail.com")).toBe("Budi Santoso");
    expect(nameFromEmail("")).toBe("Pelanggan");
  });

  it("suggests the fee rounded up to Rp 100", () => {
    expect(suggestedFee(112_860, 20)).toBe(22_600);
    expect(suggestedFee(100_001, 10)).toBe(10_100);
    expect(suggestedFee(0, 20)).toBe(0);
  });
});

describe("chat settings", () => {
  it("fills defaults for settings saved before chat existed", () => {
    const parsed = discoveryConfigSchema.parse({
      enabled: true,
      photoEnabled: true,
      dailyLimit: 10,
      photoDailyLimit: 5,
      dailyAiRequests: 20,
    });
    expect(parsed).toMatchObject({
      chatEnabled: true,
      replyTargetMinutes: 15,
      openHour: 9,
      closeHour: 21,
      idleCloseDays: 7,
    });
    expect(parsed.templates.length).toBeGreaterThan(0);
  });
  it("rejects bad hours and templates", () => {
    expect(() => discoveryConfigSchema.parse({ openHour: 25 })).toThrow();
    expect(() => discoveryConfigSchema.parse({ templates: ["x"] })).toThrow();
    expect(() => discoveryConfigSchema.parse({ templates: Array(13).fill("Halo ya") })).toThrow();
  });
});
