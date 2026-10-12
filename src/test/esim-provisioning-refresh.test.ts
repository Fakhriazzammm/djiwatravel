import { describe, expect, it } from "vitest";
import { firstProviderRecordList } from "../lib/esim-provisioning-refresh.server";

// The provider nests the eSIM list under an undocumented key, so the pull must find the records
// without hard-coding a key that a provider change would break.
describe("provider profile list extraction", () => {
  it("reads the list from obj", () => {
    expect(firstProviderRecordList({ success: true, obj: { esimList: [{ iccid: "891" }], pager: { total: 1 } } }))
      .toEqual([{ iccid: "891" }]);
  });

  it("reads the list from data", () => {
    expect(firstProviderRecordList({ data: { list: [{ iccid: "892" }] } })).toEqual([{ iccid: "892" }]);
  });

  it("ignores a pager object and still finds the array", () => {
    expect(firstProviderRecordList({ obj: { pager: { pageNum: 1, total: 2 }, esimList: [{ iccid: "893" }] } }))
      .toEqual([{ iccid: "893" }]);
  });

  it("returns an empty list when the provider has no profile yet", () => {
    expect(firstProviderRecordList({ success: true, obj: { esimList: [] } })).toEqual([]);
    expect(firstProviderRecordList({ success: true, obj: { pager: { total: 0 } } })).toEqual([]);
    expect(firstProviderRecordList(null)).toEqual([]);
    expect(firstProviderRecordList(undefined)).toEqual([]);
  });

  it("drops entries that are not records", () => {
    expect(firstProviderRecordList({ obj: { esimList: [{ iccid: "1" }, null, "x", 7] } })).toEqual([{ iccid: "1" }]);
  });
});
