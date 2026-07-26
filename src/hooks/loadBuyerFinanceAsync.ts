import "server-only";

import { getPublisherConversionsAsync } from "@/repositories/publisher-conversion.repository";
import {
  toBuyerFinanceView,
  type BuyerFinanceView,
} from "@/lib/finance/buyer-finance-view";

/**
 * Phase 20M-R -- load the authenticated buyer's own cashback totals.
 *
 * This replaces the mock-backed `loadFinanceAsync` chain for `/app/finance`.
 * Ownership is enforced by `getPublisherConversionsAsync`, which resolves the
 * Supabase server session and filters `conversions` by
 * `publisher_id = user.id`. No client-supplied identifier participates in the
 * query, and the aggregation runs server-side so the client only ever
 * receives the narrowed {@link BuyerFinanceView}.
 */
export async function loadBuyerFinanceAsync(): Promise<BuyerFinanceView> {
  const conversions = await getPublisherConversionsAsync();
  return toBuyerFinanceView(conversions);
}
