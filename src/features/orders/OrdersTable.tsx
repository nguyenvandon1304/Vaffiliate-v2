import type { Order } from "@/types/orders";

type OrdersTableProps = {
  orders: Order[];
};

export default function OrdersTable({ orders }: OrdersTableProps) {
  return (
    <section className="pb-8">
      <div className="grid gap-3">
        {orders.map((order) => (
          <article
            key={`${order.store}-${order.time}`}
            className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[color:var(--text)]">{order.store}</p>
                <p className="mt-1 text-sm font-medium text-[color:var(--text-muted)]">
                  {order.item}
                </p>
              </div>
              <p className="text-sm font-semibold text-[color:var(--success)]">
                {order.amount}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 font-medium text-[color:var(--brand-strong)]">
                {order.status}
              </span>
              <span className="font-medium text-[color:var(--text-muted)]">{order.time}</span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-sm">
              <span className="font-medium text-[color:var(--text-muted)]">Giá trị đơn</span>
              <span className="font-medium text-[color:var(--text)]">{order.total}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
