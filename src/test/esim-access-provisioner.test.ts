import { describe, expect, it } from "vitest";
import { createEsimAccessProvisioner } from "@/lib/esim-access-provisioner";

describe("eSIM Access provisioner", () => {
  it("maps a successful provider response without changing provider payload", async () => {
    const gateway = createEsimAccessProvisioner(async ({ data }) => ({
      success: true,
      errorCode: 0,
      obj: { orderNo: "EA-1", status: "PENDING", echoed: data.transactionId },
    }));
    const result = await gateway.provision({
      orderId: "o1",
      transactionId: "DJIWA-o1",
      packageInfoList: [{ packageCode: "JC004", count: 1 }],
    });
    expect(result.providerOrderNo).toBe("EA-1");
    expect(result.providerTransactionId).toBe("DJIWA-o1");
  });
  it("fails closed on provider errors", async () => {
    const gateway = createEsimAccessProvisioner(async () => ({
      success: false,
      errorCode: 12001,
      errorMsg: "insufficient balance",
    }));
    await expect(
      gateway.provision({
        orderId: "o1",
        transactionId: "DJIWA-o1",
        packageInfoList: [{ packageCode: "JC004", count: 1 }],
      }),
    ).rejects.toThrow("insufficient balance");
  });
});
