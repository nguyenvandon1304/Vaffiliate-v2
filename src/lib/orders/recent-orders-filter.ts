import type { RecentOrder } from "@/types/orders";

/**
 * Phase 20I.8 follow-up safety -- active-recent-orders filter.
 *
 * TikTok Shop is not active. It must not appear as active order
 * history with cashback amounts, "Đang đối soát", "Có thể rút",
 * "Đã thanh toán", or any reconciliation status. TikTok Shop is
 * roadmap-only and may only show up as upcoming / sắp hỗ trợ.
 *
 * Every buyer-facing orders surface (`/app` "Đơn hàng gần đây"
 * widget, `/app/orders` table) must run its `RecentOrder[]` input
 * through `filterActiveRecentOrders` before rendering. The filter
 * is the single source of truth for the contract: it drops any row
 * whose `store` is `TikTok Shop` so TikTok Shop rows cannot reach
 * the buyer with an active reconciliation status or cashback
 * amount.
 *
 * Why a central hook? Two reasons:
 *
 *   1. The contract is shared between `ConsumerRecentOrders` (the
 *      buyer-home widget) and `RecentOrdersTable` (the
 *      `/app/orders` table). Centralising the filter means a single
 *      unit test locks the contract; a regression in one place does
 *      not leave the other exposed.
 *   2. The hook is pure, has no I/O, and can be safely called from
 *      both server components and client components without
 *      requiring extra wiring. It does NOT mutate the input array.
 */
export function filterActiveRecentOrders(
  orders: ReadonlyArray<RecentOrder>,
): RecentOrder[] {
  const out: RecentOrder[] = [];
  for (const order of orders) {
    if (!order || typeof order !== "object") continue;
    if (typeof order.store !== "string") continue;
    // Drop any platform that is not on the active list. Today,
    // Shopee is the only active platform; TikTok Shop and any
    // future non-active platform are stripped here.
    if (!isActiveOrderStore(order.store)) continue;
    out.push(order);
  }
  return out;
}

/**
 * Single source of truth for "which store names count as active on
 * the buyer-facing order surface today". TikTok Shop is
 * intentionally absent -- see filterActiveRecentOrders.
 */
export function isActiveOrderStore(store: string): boolean {
  const normalized = store.trim().toLowerCase();
  if (normalized === "shopee") return true;
  // Anything else (TikTok Shop, Lazada, Tiki, Sendo, ...) is
  // upcoming / sắp hỗ trợ and must not appear in active order rows.
  return false;
}
