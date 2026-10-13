import { describe, expect, it } from "vitest";
import { providerOrderFailed } from "../lib/mayar-provisioning.server";

// A live provider order was thrown away because the success answer carries `errorCode: null`,
// which the old truthiness check read as a failure. This pins the accepted shapes.
describe("eSIM provider order outcome", () => {
  it("accepts a success answer whose errorCode is null", () => {
    expect(providerOrderFailed({ errorCode: null, errorMsg: null, success: true })).toBe(false);
  });

  it("accepts a success answer with no error fields at all", () => {
    expect(providerOrderFailed({ success: true })).toBe(false);
    expect(providerOrderFailed({})).toBe(false);
  });

  it("accepts the string and numeric zero codes", () => {
    expect(providerOrderFailed({ errorCode: "0", success: true })).toBe(false);
    expect(providerOrderFailed({ errorCode: 0, success: true })).toBe(false);
  });

  it("rejects an explicit non-zero code", () => {
    expect(providerOrderFailed({ errorCode: "400002", success: true })).toBe(true);
    expect(providerOrderFailed({ errorCode: 400002 })).toBe(true);
  });

  it("rejects an explicit success:false even without a code", () => {
    expect(providerOrderFailed({ success: false })).toBe(true);
  });
});
