import Link from "next/link";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import SectionHeader from "@/components/ui/SectionHeader";
import type { RecentOrder } from "@/types/orders";

type ConsumerRecentOrdersProps = {
  orders: RecentOrder[];
};

function OrderStatusBadge({ status }: { status: string }) {
  const variant =
    status === "Có thể rút" || status === "Đã duyệt hoa hồng"
      ? "success"
      : status === "Từ chối"
        ? "danger"
        : status === "Chờ đối soát"
          ? "warning"
          : "default";
  return <Badge variant={variant}>{status}</Badge>;
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
        <p className="shrink-0 text-sm font-semibold text-[color:var(--success)]">
          {order.amount}
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
