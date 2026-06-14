import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import SectionHeader from "@/components/ui/SectionHeader";
import type { RecentOrder } from "@/types/orders";

type RecentOrdersTableProps = {
  orders: RecentOrder[];
};

export default function RecentOrdersTable({ orders }: RecentOrdersTableProps) {
  return (
    <Card className="bg-[rgba(255,250,246,0.72)] p-5">
      <SectionHeader
        title="Đơn hàng gần đây"
        description="Bảng tóm tắt giao dịch gần nhất"
      />

      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-white/70">
        <div className="grid grid-cols-[1.2fr_1.4fr_0.8fr_0.9fr_0.8fr] gap-3 border-b border-[color:var(--line)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
          <span>Cửa hàng</span>
          <span>Sản phẩm</span>
          <span>Trạng thái</span>
          <span>Giá trị</span>
          <span>Thời gian</span>
        </div>
        <div className="divide-y divide-[color:var(--line)]">
          {orders.map((order) => (
            <div
              key={`${order.store}-${order.time}`}
              className="grid grid-cols-[1.2fr_1.4fr_0.8fr_0.9fr_0.8fr] gap-3 px-4 py-4 text-sm"
            >
              <span className="font-semibold text-[color:var(--text)]">{order.store}</span>
              <span className="font-medium text-[color:var(--text-muted)]">{order.item}</span>
              <Badge>{order.status}</Badge>
              <span className="font-semibold text-[color:var(--success)]">{order.amount}</span>
              <span className="font-medium text-[color:var(--text-muted)]">{order.time}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
