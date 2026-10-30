import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { partitionSellability, sellabilityMode, type SellablePackage } from "./sellability";

const sellabilityInput = z.object({
  packages: z
    .array(
      z.object({
        packageCode: z.string().trim().min(1).max(120),
        providerPriceUnits: z.number().nonnegative(),
      }),
    )
    .max(2_000),
});

export type SellabilityRead = {
  mode: "off" | "shadow" | "on";
  /** False when the provider balance could not be read right now: availability must not be claimed. */
  balanceKnown: boolean;
  /** Package codes the balance cannot cover. */
  hidden: string[];
};

/**
 * Balance-aware sellability exposed as a server read.
 *
 * The catalogue pages used to call the server-only module straight from their loaders, so a
 * client-side navigation recomputed the answer in the browser (empty cache, no provider access)
 * and could disagree with the server-rendered page — which is why an unavailable package only
 * looked unavailable after a refresh. A server function gives both paths the same answer, and the
 * balance itself never leaves the server.
 */
export const readSellability = createServerFn({ method: "POST" })
  .validator(sellabilityInput)
  .handler(async ({ data }): Promise<SellabilityRead> => {
    const { getBalanceSnapshot } = await import("./sellability.server");
    const mode = sellabilityMode();
    const snapshot = await getBalanceSnapshot();
    const balanceKnown = snapshot.balanceUnits !== null && Number.isFinite(snapshot.balanceUnits);
    if (mode !== "on") {
      return { mode, balanceKnown, hidden: [] };
    }
    const partition = partitionSellability(data.packages as SellablePackage[], snapshot);
    return { mode, balanceKnown, hidden: [...partition.hidden] };
  });
