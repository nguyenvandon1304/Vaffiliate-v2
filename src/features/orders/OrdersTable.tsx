import Badge from "@/components/ui/Badge";
import type {
OrderStatus,
RecentOrder,
} from "@/types/orders";

type OrdersTableProps = {
orders: RecentOrder[];
};
type BadgeVariant =
| "default"
| "success"
| "warning"
| "neutral"
| "danger";

const displayStatusMap: Record<OrderStatus, string> = {
recorded: "Đã ghi nhận",
reconciling: "Chờ đối soát",
approved: "Đã duyệt",
rejected: "Không được duyệt",
payable: "Có thể rút",
paid: "Đã thanh toán",
};

function getDisplayVariant(
status: OrderStatus,
): BadgeVariant {
switch (status) {
case "approved":
case "payable":
case "paid":
return "success";

case "rejected":
  return "danger";

case "recorded":
case "reconciling":
  return "warning";

}
}

export default function OrdersTable({
orders,
}: OrdersTableProps) {
return ( <section className="pb-8"> <div className="grid gap-3">
{orders.map((order) => (
<article
key={`${order.store}-${order.item}-${order.time}`}
className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
> <div className="flex items-start justify-between gap-3"> <div className="min-w-0"> <p className="truncate font-semibold text-[color:var(--text)]">
{order.store} </p>

            <p className="mt-1 truncate text-sm font-medium text-[color:var(--text-muted)]">
              {order.item}
            </p>
          </div>

          <p className="shrink-0 text-sm font-semibold text-[color:var(--success)]">
            {order.amount}
          </p>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Badge variant={getDisplayVariant(order.status)}>
            {displayStatusMap[order.status]}
          </Badge>

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
    ))}
  </div>
</section>

);
}
