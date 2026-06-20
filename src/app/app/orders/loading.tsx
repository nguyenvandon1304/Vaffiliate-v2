import { OrdersLoadingState } from "@/features/orders/OrdersStates";

export default function OrdersLoading() {
  return (
    <div className="px-4 py-6">
      <OrdersLoadingState />
    </div>
  );
}
