import { orderEsimAccessProfiles } from "./esim-access";
import type { EsimProvisioningGateway, ProvisioningResult } from "./reseller-provisioning";
import type { ProvisioningOrderDraft } from "./reseller-order";

type ProviderOrderResponse = { success?: boolean; errorCode?: number | string; errorMsg?: string; obj?: Record<string, unknown>; data?: Record<string, unknown> };
type OrderFn = (input: { data: { transactionId: string; packageInfoList: ProvisioningOrderDraft["packageInfoList"] } }) => Promise<unknown>;

function providerResult(response: ProviderOrderResponse, transactionId: string): ProvisioningResult {
  if (response.success === false || (response.errorCode !== undefined && String(response.errorCode) !== "0")) throw new Error(`eSIM Access order gagal: ${response.errorMsg ?? response.errorCode ?? "unknown"}`);
  const result = response.obj ?? response.data ?? {};
  const providerOrderNo = String(result["orderNo"] ?? result["orderNum"] ?? result["orderNoStr"] ?? "");
  return { providerTransactionId: transactionId, ...(providerOrderNo ? { providerOrderNo } : {}), status: String(result["status"] ?? "PENDING"), payload: response };
}

export function createEsimAccessProvisioner(orderFn: OrderFn = orderEsimAccessProfiles as unknown as OrderFn): EsimProvisioningGateway {
  return {
    async provision(draft) {
      const response = await orderFn({ data: { transactionId: draft.transactionId, packageInfoList: draft.packageInfoList } });
      return providerResult(response as ProviderOrderResponse, draft.transactionId);
    },
  };
}
