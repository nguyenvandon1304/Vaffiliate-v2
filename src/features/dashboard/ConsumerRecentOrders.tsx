import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import SectionHeader from "@/components/ui/SectionHeader";
import type { RecentOrder } from "@/types/orders";
import { getOrderStatusPresentation } from "@/lib/statusPresentation";

type ConsumerRecentOrdersProps = {
  orders: RecentOrder[];
};

function OrderStatusBadge({ status }: { status: RecentOrder["status"] }) {
  const presentation = getOrderStatusPresentation(status);
  return <Badge variant={presentation.variant}>{presentation.label}</Badge>;
}

function getAmountClassName(status: RecentOrder["status"]): string {
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

function formatAmountForDisplay(amount: string, status: RecentOrder["status"]): string {
  if (status === "rejected") {
    return amount.replace(/^\+/, "");
  }
  return amount;
}

function OrderCard({ order }: { order: RecentOrder }) {
  return (
    <article className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[color:var(--text)]">
            {order.store}
          </p>
          <p className="mt-0.5 truncate text-sm font-medium text-[color:var(--text-muted)]">
            {order.item}
          </p>
        </div>
        <p className={getAmountClassName(order.status)}>
          {formatAmountForDisplay(order.amount, order.status)}
        </p>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <OrderStatusBadge status={order.status} />
        <span className="text-xs font-medium text-[color:var(--text-muted)]">
          {order.time}
        </span>
      </div>
    </article>
  );
}

export default function ConsumerRecentOrders({ orders }: ConsumerRecentOrdersProps) {
  return (
    <Card className="p-5">
      <SectionHeader
        title="Đơn hàng gần đây"
        description="Các giao dịch được ghi nhận gần nhất."
      />
      <div className="mt-4 grid gap-3">
        {orders.length === 0 ? (
          <p className="py-4 text-center text-sm text-[color:var(--text-muted)]">
            Chưa có đơn hàng nào được ghi nhận.
          </p>
        ) : (
          orders.map((order) => <OrderCard key={`${order.store}-${order.time}`} order={order} />)
        )}
      </div>
      <Link
        href="/app/orders"
        className="mt-4 block text-center text-sm font-semibold text-[color:var(--brand-strong)]"
      >
        Xem tất cả đơn hàng →
      </Link>
    </Card>
  );
}
