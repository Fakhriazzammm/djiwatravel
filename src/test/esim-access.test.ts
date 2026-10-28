import { describe, expect, it } from "vitest";
import {
  buildEsimAccessSignature,
  esimAccessQuerySchema,
  providerErrorMessage,
} from "@/lib/esim-access";

describe("eSIM Access API contract", () => {
  it("accepts the documented dataType package filter", () => {
    expect(esimAccessQuerySchema.parse({ locationCode: "JP", dataType: "2" })).toEqual({
      locationCode: "JP",
      dataType: "2",
    });
  });

  it("builds the documented HMAC signature from the exact request string", () => {
    expect(
      buildEsimAccessSignature({
        timestamp: "1628670421",
        requestId: "4ce9d9cdac9e4e17b3a2c66c358c1ce2",
        accessCode: "11111",
        requestBody: '{"imsi":"326543826"}',
        secretKey: "1111",
      }),
    ).toBe("7eb765e27df5373dea2dbc8c41a7d9557743e46c8054750f3d851b3fd01d0835");
  });

  it("preserves provider errorMessage before falling back to errorMsg or code", () => {
    expect(
      providerErrorMessage({ errorCode: "200007", errorMessage: "Insufficient balance" }),
    ).toBe("Insufficient balance");
    expect(providerErrorMessage({ errorCode: "200008", errorMsg: "Invalid order" })).toBe(
      "Invalid order",
    );
    expect(providerErrorMessage({ errorCode: "900001" })).toBe("eSIM Access error 900001");
  });
});
