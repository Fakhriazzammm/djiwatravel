import { describe, expect, it } from "vitest";
import {
  firstProviderRecordList,
  providerTimestamp,
} from "../lib/esim-provisioning-refresh.server";

// The provider nests the eSIM list under an undocumented key, so the pull must find the records
// without hard-coding a key that a provider change would break.
describe("provider profile list extraction", () => {
  it("reads the list from obj", () => {
    expect(
      firstProviderRecordList({
        success: true,
        obj: { esimList: [{ iccid: "891" }], pager: { total: 1 } },
      }),
    ).toEqual([{ iccid: "891" }]);
  });

  it("reads the list from data", () => {
    expect(firstProviderRecordList({ data: { list: [{ iccid: "892" }] } })).toEqual([
      { iccid: "892" },
    ]);
  });

  it("ignores a pager object and still finds the array", () => {
    expect(
      firstProviderRecordList({
        obj: { pager: { pageNum: 1, total: 2 }, esimList: [{ iccid: "893" }] },
      }),
    ).toEqual([{ iccid: "893" }]);
  });

  it("returns an empty list when the provider has no profile yet", () => {
    expect(firstProviderRecordList({ success: true, obj: { esimList: [] } })).toEqual([]);
    expect(firstProviderRecordList({ success: true, obj: { pager: { total: 0 } } })).toEqual([]);
    expect(firstProviderRecordList(null)).toEqual([]);
    expect(firstProviderRecordList(undefined)).toEqual([]);
  });

  it("drops entries that are not records", () => {
    expect(firstProviderRecordList({ obj: { esimList: [{ iccid: "1" }, null, "x", 7] } })).toEqual([
      { iccid: "1" },
    ]);
  });
});

// The activation window comes from the provider as "2027-04-10T10:58:23+0000"; storing a wrong or
// dropped value would let the app advertise an eSIM that has already expired (or hide a live one).
describe("provider activation expiry", () => {
  it("parses the provider timestamp format", () => {
    expect(providerTimestamp("2027-04-10T10:58:23+0000")).toBe("2027-04-10T10:58:23.000Z");
  });

  it("returns null for a missing or unreadable value instead of guessing", () => {
    expect(providerTimestamp(undefined)).toBeNull();
    expect(providerTimestamp("")).toBeNull();
    expect(providerTimestamp("not-a-date")).toBeNull();
  });
});
