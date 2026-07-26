import "server-only";

import { getPublisherConversionsAsync } from "@/repositories/publisher-conversion.repository";
import {
  matchesBuyerStatusFilter,
  toBuyerOrderView,
  type BuyerOrderView,
} from "@/lib/orders/buyer-order-view";
import type { OrderStatusFilter } from "@/types/orders";

export interface BuyerOrdersData {
  readonly orders: readonly BuyerOrderView[];
}

/**
 * Phase 20L -- load the authenticated buyer's own orders.
 *
 * Ownership is enforced by `getPublisherConversionsAsync`, which resolves
 * the Supabase server session and filters `conversions` by
 * `publisher_id = user.id`. No client-supplied identifier participates in
 * the query. This loader only narrows each owned conversion to the minimal
 * public {@link BuyerOrderView} and applies the buyer's status filter.
 */
export async function loadBuyerOrdersAsync(
  statusFilter: OrderStatusFilter = "all",
): Promise<BuyerOrdersData> {
  const conversions = await getPublisherConversionsAsync();

  const orders = conversions
    .filter((conversion) =>
      matchesBuyerStatusFilter(conversion.status, statusFilter),
    )
    .map(toBuyerOrderView);

  return { orders };
}
