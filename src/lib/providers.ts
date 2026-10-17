// Provider abstractions. Real implementations (EsimAccessProvider, Xendit/Midtrans)
// must run server-side only; this mock lets the full UI work without credentials.
export type EsimProfile = {
  iccid: string;
  smdp: string;
  activationCode: string;
  lpa: string;
  iosUrl?: string;
};

export interface EsimProvider {
  name: string;
  createEsim(packageId: string, idempotencyKey: string): Promise<EsimProfile>;
  getUsage(iccid: string): Promise<{ usedGb: number }>;
  topUp(iccid: string, topUpId: string, idempotencyKey: string): Promise<void>;
}

export interface PaymentProvider {
  name: string;
  createPayment(
    orderId: string,
    amount: number,
    method: "qris" | "va",
  ): Promise<{ paymentId: string; qrString?: string; vaNumber?: string }>;
}

const rnd = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");

export const mockEsimProvider: EsimProvider = {
  name: "mock",
  async createEsim() {
    await new Promise((r) => setTimeout(r, 1200));
    const smdp = "rsp.djiwa-demo.example";
    const code = rnd(4) + "-" + rnd(4) + "-" + rnd(4);
    return { iccid: "8985" + rnd(15), smdp, activationCode: code, lpa: `LPA:1$${smdp}$${code}` };
  },
  async getUsage() {
    return { usedGb: 1.8 };
  },
  async topUp() {
    await new Promise((r) => setTimeout(r, 800));
  },
};

export const mockPaymentProvider: PaymentProvider = {
  name: "mock",
  async createPayment(orderId, _amount, method) {
    return method === "qris"
      ? { paymentId: "pay_" + orderId, qrString: "00020101021226DJIWADEMO" + orderId }
      : { paymentId: "pay_" + orderId, vaNumber: "8808" + rnd(12) };
  },
};
