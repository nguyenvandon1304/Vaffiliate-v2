import Badge from "@/components/ui/Badge";
import type { RecentOrder } from "@/types/orders";
import { getOrderStatusPresentation } from "@/lib/statusPresentation";
import { filterActiveRecentOrders } from "@/lib/orders/recent-orders-filter";

type OrdersTableProps = {
  orders: RecentOrder[];
};

function getOrderAmountClassName(status: RecentOrder["status"]): string {
  switch (status) {
    case "approved":
    case "payable":
    case "paid":
      return "shrink-0 text-sm font-semibold text-[color:var(--success)]";
    case "rejected":
      return "shrink-0 text-sm font-semibold text-[color:var(--text-muted)]";
    case "recorded":
    case "reconciling":
      return "shrink-0 text-sm font-semibold text-[color:var(--text)]";
  }
}

function formatOrderAmountForDisplay(
  amount: string,
  status: RecentOrder["status"],
): string {
  if (status === "rejected") {
    return amount.replace(/^\+/, "");
  }
  return amount;
}

export default function OrdersTable({
  orders,
}: OrdersTableProps) {
  // Phase 20I.8 follow-up safety: TikTok Shop is upcoming, not
  // active. We must not surface TikTok Shop order rows paired
  // with cashback amounts, "Đang đối soát", "Có thể rút", or
  // "Đã thanh toán". Run the input through the central filter
  // helper (the same one `ConsumerRecentOrders` and
  // `RecentOrdersTable` use) so the contract is locked at the
  // render boundary regardless of which data layer eventually
  // feeds `/app/orders`.
  const activeOrders = filterActiveRecentOrders(orders);
  return (
    <section className="pb-8">
      <div className="grid gap-3">
        {activeOrders.map((order) => {
          const presentation = getOrderStatusPresentation(order.status);
          const amountClass = getOrderAmountClassName(order.status);
          const displayAmount = formatOrderAmountForDisplay(order.amount, order.status);

          return (
            <article
              key={`${order.store}-${order.item}-${order.time}`}
              className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[color:var(--text)]">
                    {order.store}
                  </p>
                  <p className="mt-1 truncate text-sm font-medium text-[color:var(--text-muted)]">
                    {order.item}
                  </p>
                </div>
                <p className={amountClass}>{displayAmount}</p>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <Badge variant={presentation.variant}>{presentation.label}</Badge>
                <span className="text-xs font-medium text-[color:var(--text-muted)]">
                  {order.time}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-sm">
                <span className="font-medium text-[color:var(--text-muted)]">
                  Giá trị đơn
                </span>
                <span className="font-medium text-[color:var(--text)]">
                  {order.total}
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
