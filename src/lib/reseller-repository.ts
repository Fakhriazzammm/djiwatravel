import type { ResellerCatalogPackage } from "./esim-access-catalog";
import type { ResellerOrderStatus } from "./reseller-order";

export type ResellerOrderRecord = {
  id: string;
  status: ResellerOrderStatus;
  totalAmount: number;
  currency: "IDR";
  idempotencyKey: string;
  packageCode: string;
  createdAt: number;
  priceSnapshot?: Record<string, number | string>;
  providerOrderNo?: string;
  providerStatus?: string;
  expiresAt?: number;
};
export type EsimProfileRecord = {
  orderId: string;
  iccid: string;
  esimTranNo?: string;
  smdpAddress?: string;
  status: string;
  qrPayloadEncrypted?: string;
  activationCodeEncrypted?: string;
  activatedAt?: string;
  expiresAt?: string;
  providerPayload?: Record<string, unknown>;
};

export interface ResellerRepository {
  upsertPackages(packages: ResellerCatalogPackage[]): Promise<void>;
  listPackages(locationCode?: string): Promise<ResellerCatalogPackage[]>;
  createOrder(order: ResellerOrderRecord): Promise<ResellerOrderRecord>;
  updateOrderStatus(id: string, status: ResellerOrderStatus): Promise<ResellerOrderRecord>;
  getOrder(id: string): Promise<ResellerOrderRecord | null>;
  saveProfile(profile: EsimProfileRecord): Promise<void>;
  hasWebhookFingerprint(fingerprint: string): Promise<boolean>;
  rememberWebhookFingerprint(fingerprint: string): Promise<void>;
}

/** Development adapter. Replace with the SQL adapter after DB selection. */
export class InMemoryResellerRepository implements ResellerRepository {
  private readonly packages = new Map<string, ResellerCatalogPackage>();
  private readonly orders = new Map<string, ResellerOrderRecord>();
  private readonly profiles = new Map<string, EsimProfileRecord>();
  private readonly webhooks = new Set<string>();

  async upsertPackages(packages: ResellerCatalogPackage[]) {
    for (const pkg of packages) this.packages.set(pkg.packageCode, pkg);
  }
  async listPackages(locationCode?: string) {
    const all = [...this.packages.values()];
    return locationCode
      ? all.filter((pkg) => pkg.locationCodes.includes(locationCode.toUpperCase()))
      : all;
  }
  async createOrder(order: ResellerOrderRecord) {
    if ([...this.orders.values()].some((item) => item.idempotencyKey === order.idempotencyKey))
      throw new Error("Order idempotency key sudah digunakan");
    this.orders.set(order.id, order);
    return order;
  }
  async updateOrderStatus(id: string, status: ResellerOrderStatus) {
    const order = this.orders.get(id);
    if (!order) throw new Error("Order tidak ditemukan");
    const updated = { ...order, status };
    this.orders.set(id, updated);
    return updated;
  }
  async getOrder(id: string) {
    return this.orders.get(id) ?? null;
  }
  async saveProfile(profile: EsimProfileRecord) {
    this.profiles.set(profile.iccid, profile);
  }
  async hasWebhookFingerprint(fingerprint: string) {
    return this.webhooks.has(fingerprint);
  }
  async rememberWebhookFingerprint(fingerprint: string) {
    this.webhooks.add(fingerprint);
  }
}
