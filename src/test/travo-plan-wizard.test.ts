import { describe, expect, it } from "vitest";
import {
  nextStep,
  parseAnswer,
  question,
  recapLines,
  returnDateOf,
  toRequest,
  type WizardAnswers,
} from "@/lib/travo-plan-wizard";

const TODAY = "2026-11-10";
const full: WizardAnswers = {
  country: { code: "JP", name: "Jepang" },
  city: { name: "Tokyo", lat: 35.67, lng: 139.65 },
  origin: { code: "CGK", name: "Jakarta" },
  oneWay: false,
  departureDate: "2026-12-10",
  days: 5,
  travelers: 2,
  budgetIdr: 20_000_000,
  style: "nyaman",
  interests: ["Kuliner"],
  esim: true,
  confirmed: true,
};

describe("planning wizard order", () => {
  it("asks for the first missing thing, in order, and finishes", () => {
    const steps: string[] = [];
    let a: WizardAnswers = {};
    const patches: Record<string, Partial<WizardAnswers>> = {
      country: { country: full.country! },
      city: { city: full.city! },
      origin: { origin: null },
      tripType: { oneWay: true },
      departure: { departureDate: "2026-12-10" },
      days: { days: 3 },
      travelers: { travelers: 1 },
      budget: { budgetIdr: 0 },
      style: { style: "auto" },
      interests: { interests: [] },
      esim: { esim: false },
      confirm: { confirmed: true },
    };
    for (let guard = 0; guard < 20; guard += 1) {
      const step = nextStep(a);
      if (!step) break;
      steps.push(step);
      a = { ...a, ...patches[step]! };
    }
    expect(steps).toEqual([
      "country",
      "city",
      "origin",
      "tripType",
      "departure",
      "days",
      "travelers",
      "budget",
      "style",
      "interests",
      "esim",
      "confirm",
    ]);
    expect(nextStep(a)).toBeNull();
  });
  it("treats 'skip origin' (null) and 'budget 0' as answered, not missing", () => {
    expect(nextStep({ ...full, origin: null, budgetIdr: 0, confirmed: false })).toBe("confirm");
  });
});

describe("reading answers", () => {
  const p = (step: Parameters<typeof parseAnswer>[0], raw: string, a: WizardAnswers = {}) =>
    parseAnswer(step, raw, a, TODAY);
  it("country: chip names and typed names, never Indonesia", () => {
    expect(p("country", "Jepang")).toMatchObject({ ok: true, patch: { country: { code: "JP" } } });
    expect(p("country", "thailand")).toMatchObject({
      ok: true,
      patch: { country: { code: "TH" } },
    });
    expect(p("country", "asdfgh")).toMatchObject({ ok: false });
    expect(p("country", "Indonesia")).toMatchObject({ ok: false });
  });
  it("city: popular cities carry their point, typed ones are tidied", () => {
    expect(p("city", "Tokyo", { country: { code: "JP", name: "Jepang" } })).toMatchObject({
      ok: true,
      patch: { city: { name: "Tokyo", lat: 35.6762 } },
    });
    expect(p("city", "  kuala   lumpur ")).toMatchObject({
      ok: true,
      patch: { city: { name: "Kuala Lumpur" } },
    });
    expect(p("city", "<b>")).toMatchObject({ ok: false });
  });
  it("trip type, style, esim, interests", () => {
    expect(p("tripType", "Sekali jalan")).toMatchObject({ patch: { oneWay: true } });
    expect(p("tripType", "Pulang-pergi")).toMatchObject({ patch: { oneWay: false } });
    expect(p("style", "Hemat")).toMatchObject({ patch: { style: "hemat" } });
    expect(p("style", "Terserah Travo")).toMatchObject({ patch: { style: "auto" } });
    expect(p("esim", "Tidak perlu")).toMatchObject({ patch: { esim: false } });
    expect(p("esim", "Ya, sertakan eSIM")).toMatchObject({ patch: { esim: true } });
    expect(p("interests", "Kuliner, Alam, Bukan pilihan")).toMatchObject({
      patch: { interests: ["Kuliner", "Alam"] },
    });
  });
  it("departure: real, future, within 18 months", () => {
    expect(p("departure", "2026-12-10")).toMatchObject({
      ok: true,
      patch: { departureDate: "2026-12-10" },
    });
    expect(p("departure", "2026-11-01")).toMatchObject({ ok: false });
    expect(p("departure", "2030-01-01")).toMatchObject({ ok: false });
    expect(p("departure", "besok")).toMatchObject({ ok: false });
    expect(p("departure", "2026-02-31")).toMatchObject({ ok: false });
  });
  it("days and travelers have bounds", () => {
    expect(p("days", "5 hari")).toMatchObject({ patch: { days: 5 } });
    expect(p("days", "14")).toMatchObject({ ok: false });
    expect(p("days", "nol")).toMatchObject({ ok: false });
    expect(p("travelers", "2 orang")).toMatchObject({ patch: { travelers: 2 } });
    expect(p("travelers", "11")).toMatchObject({ ok: false });
  });
  it("budget: 'hitungkan saja', plain numbers, juta, and a floor", () => {
    expect(p("budget", "Hitungkan saja")).toMatchObject({ patch: { budgetIdr: 0 } });
    expect(p("budget", "20000000")).toMatchObject({ patch: { budgetIdr: 20_000_000 } });
    expect(p("budget", "Rp 20.000.000")).toMatchObject({ patch: { budgetIdr: 20_000_000 } });
    expect(p("budget", "15 juta")).toMatchObject({ patch: { budgetIdr: 15_000_000 } });
    expect(p("budget", "2,5 juta")).toMatchObject({ patch: { budgetIdr: 2_500_000 } });
    expect(p("budget", "500")).toMatchObject({ ok: false });
  });
  it("rejects empty text", () => {
    expect(p("city", "   ")).toMatchObject({ ok: false });
  });
});

describe("the request", () => {
  it("builds only when everything is answered, and computes the return date", () => {
    const { esim: _omit, ...partial } = full;
    void _omit;
    expect(toRequest(partial)).toBeNull();
    expect(toRequest(full)).toMatchObject({
      oneWay: false,
      days: 5,
      esim: true,
      origin: { code: "CGK" },
    });
    expect(returnDateOf(full)).toBe("2026-12-14");
  });
  it("recaps each answer on its own line", () => {
    const lines = recapLines(full);
    expect(lines).toContain("Tujuan: Tokyo, Jepang");
    expect(lines.find((l) => l.startsWith("Tiket:"))).toBe("Tiket: pulang-pergi");
    expect(recapLines({ ...full, origin: null }).find((l) => l.startsWith("Berangkat"))).toContain(
      "tiket tidak dihitung",
    );
  });
  it("asks each step in Travo's voice with the right control", () => {
    expect(question("departure", full, TODAY).ask).toMatchObject({ kind: "date", min: TODAY });
    expect(question("city", full, TODAY).ask).toMatchObject({ kind: "chips" });
    expect((question("city", full, TODAY).ask as { chips: string[] }).chips).toContain("Tokyo");
    expect(question("origin", full, TODAY).ask.kind).toBe("place");
    expect(question("budget", full, TODAY).ask.kind).toBe("money");
  });
});
