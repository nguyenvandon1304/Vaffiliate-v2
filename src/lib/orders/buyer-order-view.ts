import type { Conversion, ConversionStatus, Money } from "@/types/affiliate";
import type { OrderStatusFilter } from "@/types/orders";

/**
 * Phase 20L -- minimal public projection of a buyer's own conversion.
 *
 * The buyer orders surface must never receive the full {@link Conversion}
 * shape. Internal-only fields (publisherId, networkCommission,
 * platformProfit, advertiser/campaign/offer/trackingLink ids,
 * sourceConversionKey, validation/settlement status, ingestionEventId) are
 * deliberately dropped here so they can never reach the client. Only the
 * fields a signed-in buyer needs to understand their own order and cashback
 * status are exposed.
 */
export interface BuyerOrderView {
  readonly id: string;
  readonly status: ConversionStatus;
  readonly orderAmount: Money;
  readonly cashbackAmount: Money;
  readonly occurredAt: string;
  readonly rejectedReason?: string;
}

/**
 * Project a single owned {@link Conversion} into the buyer-facing view. The
 * conversion is assumed to already belong to the authenticated buyer -- the
 * ownership filter (`publisher_id = user.id`) is enforced upstream in
 * `getPublisherConversionsAsync`. This function only narrows the fields.
 */
export function toBuyerOrderView(conversion: Conversion): BuyerOrderView {
  const view: BuyerOrderView = {
    id: conversion.id,
    status: conversion.status,
    orderAmount: conversion.orderAmount,
    cashbackAmount: conversion.userCashback,
    occurredAt: conversion.occurredAt,
  };

  if (conversion.rejectedReason !== undefined) {
    return { ...view, rejectedReason: conversion.rejectedReason };
  }

  return view;
}

/**
 * Buyer-facing status filter. `OrderStatusFilter` shares the same member
 * names as {@link ConversionStatus} plus the catch-all `all`, so the match
 * is a direct comparison with no status remapping.
 */
export function matchesBuyerStatusFilter(
  status: ConversionStatus,
  filter: OrderStatusFilter,
): boolean {
  return filter === "all" || filter === status;
}
