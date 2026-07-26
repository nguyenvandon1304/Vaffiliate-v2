import { OrdersLoadingState } from "@/features/orders/OrdersStates";

/**
 * Phase 20M-R -- route-level loading state for `/app/finance`.
 *
 * Reuses the buyer-order skeleton because the finance history renders the
 * same row shape. The skeleton matches the eventual layout instead of
 * showing a spinner, so the page does not visibly jump when data arrives.
 */
export default function FinanceLoading() {
  return (
    <div className="px-4 py-6">
      <OrdersLoadingState />
    </div>
  );
}
