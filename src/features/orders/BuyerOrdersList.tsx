import Badge from "@/components/ui/Badge";
import type { BuyerOrderView } from "@/lib/orders/buyer-order-view";
import { formatDate, formatMoney } from "@/lib/analytics/format";
import { getStatusPresentation } from "@/lib/statusPresentation";

type BuyerOrdersListProps = {
  orders: readonly BuyerOrderView[];
};

/**
 * Phase 20L -- render a buyer's own orders and cashback status.
 *
 * Each row surfaces four things a buyer can scan: the recorded date, the
 * order value, the cashback amount, and the reconciliation status. Status is
 * communicated with a text label plus a short description (and a small
 * non-essential glyph) so it never depends on color alone -- the Badge hue is
 * decorative reinforcement, not the sole signal.
 *
 * Money is formatted through the shared `formatMoney` (VND) and dates through
 * the shared `formatDate`; the component never re-implements either. Rejection
 * reasons are shown only when the source conversion carried a public reason.
 */
export default function BuyerOrdersList({ orders }: BuyerOrdersListProps) {
  return (
    <section className="pb-8" aria-label="Danh sách đơn hàng">
      <ul className="grid list-none gap-3 p-0">
        {orders.map((order) => {
          const presentation = getStatusPresentation(order.status);
          const cashbackIsPositive = order.cashbackAmount.amount > 0;

          return (
            <li key={order.id}>
              <article className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[color:var(--text-muted)]">
                      Ngày ghi nhận
                    </p>
                    <p className="mt-1 font-semibold tabular-nums text-[color:var(--text)]">
                      {formatDate(order.occurredAt)}
                    </p>
                  </div>

                  <Badge variant={presentation.variant}>
                    <span aria-hidden="true" className="mr-1">
                      {presentation.icon}
                    </span>
                    {presentation.label}
                  </Badge>
                </div>

                <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                  {presentation.description}
                </p>

                {order.status === "rejected" && order.rejectedReason ? (
                  <p className="mt-2 text-sm leading-6 text-[color:#c44536]">
                    Lý do: {order.rejectedReason}
                  </p>
                ) : null}

                <dl className="mt-4 grid gap-2 border-t border-[color:var(--line)] pt-3 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-[color:var(--text-muted)]">
                      Giá trị đơn
                    </dt>
                    <dd className="font-medium tabular-nums text-[color:var(--text)]">
                      {formatMoney(order.orderAmount)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="font-medium text-[color:var(--text-muted)]">
                      Cashback
                    </dt>
                    <dd
                      className={
                        cashbackIsPositive
                          ? "font-semibold tabular-nums text-[color:var(--success)]"
                          : "font-semibold tabular-nums text-[color:var(--text-muted)]"
                      }
                    >
                      {formatMoney(order.cashbackAmount)}
                    </dd>
                  </div>
                </dl>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
