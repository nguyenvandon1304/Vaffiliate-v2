import type { Conversion, Money } from "@/types/affiliate";
import { toBuyerOrderView, type BuyerOrderView } from "@/lib/orders/buyer-order-view";

/**
 * Phase 20M-R -- read-only projection of a buyer's own cashback totals.
 *
 * This module deliberately does NOT model a wallet balance. No wallet,
 * ledger or payout-request table exists in the schema, so any "balance"
 * would be an invented number. What the domain can prove is narrower and
 * stated literally: the sum of the buyer's own `user_cashback` grouped by
 * the verified {@link ConversionStatus} each conversion currently carries.
 *
 * Every total below therefore means "cashback currently sitting in this
 * status", nothing more. `rejected` cashback is intentionally absent from
 * the totals: it is money the buyer will not receive, so folding it into
 * any sum would overstate what they have.
 */
export interface BuyerCashbackTotals {
  /** Cashback on conversions the reconciliation flow marked `payable`. */
  readonly payable: Money;
  /** Cashback on conversions still `pending` reconciliation. */
  readonly pending: Money;
  /** Cashback on conversions `approved` but not yet payable. */
  readonly approved: Money;
  /** Cashback on conversions already `paid`. */
  readonly paid: Money;
}

export interface BuyerFinanceView {
  readonly totals: BuyerCashbackTotals;
  readonly history: readonly BuyerOrderView[];
}

const VND = "VND" as const;

function vnd(amount: number): Money {
  return { amount, currency: VND };
}

/**
 * Sum the cashback of every conversion carrying `status`.
 *
 * Amounts are integer VND (the database enforces non-negative integers and
 * `mapConversionRow` validates that at the boundary), so plain addition is
 * exact here. There is no rounding step and no rate applied: this function
 * only adds numbers the reconciliation flow already decided.
 */
function sumCashbackByStatus(
  conversions: readonly Conversion[],
  status: Conversion["status"],
): Money {
  let total = 0;
  for (const conversion of conversions) {
    if (conversion.status === status) {
      total += conversion.userCashback.amount;
    }
  }
  return vnd(total);
}

/**
 * Project owned conversions into the read-only finance view.
 *
 * Ownership is enforced upstream in `getPublisherConversionsAsync`
 * (`auth.getUser()` plus `publisher_id = user.id`); this function assumes
 * every conversion it receives already belongs to the authenticated buyer
 * and only narrows and aggregates.
 *
 * The history reuses the Phase 20L {@link BuyerOrderView} projection rather
 * than defining a second public shape, so the field whitelist stays in one
 * place and internal columns cannot leak through this surface either.
 */
export function toBuyerFinanceView(
  conversions: readonly Conversion[],
): BuyerFinanceView {
  return {
    totals: {
      payable: sumCashbackByStatus(conversions, "payable"),
      pending: sumCashbackByStatus(conversions, "pending"),
      approved: sumCashbackByStatus(conversions, "approved"),
      paid: sumCashbackByStatus(conversions, "paid"),
    },
    history: conversions.map(toBuyerOrderView),
  };
}
