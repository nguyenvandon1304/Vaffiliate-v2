import type { BuyerCashbackTotals } from "@/lib/finance/buyer-finance-view";
import { formatMoney } from "@/lib/analytics/format";
import { getStatusLabel } from "@/lib/statusPresentation";

type CashbackSummaryPanelProps = {
  totals: BuyerCashbackTotals;
};

/**
 * Phase 20M-R -- read-only cashback totals grouped by verified status.
 *
 * Hierarchy is deliberate: `payable` is the one figure a buyer needs to read
 * at a glance, so it alone gets display size. The remaining statuses are
 * secondary and render as flat rows rather than equal-weight cards, because
 * showing four same-sized tiles would imply the four numbers matter equally
 * and hide the only one that answers "how much is actually mine to take".
 *
 * Labels come from `getStatusLabel` so the wording matches `/app/orders`
 * exactly and no second status vocabulary is introduced. Amounts use the
 * shared `formatMoney`; `tabular-nums` keeps the column steady.
 */
export default function CashbackSummaryPanel({
  totals,
}: CashbackSummaryPanelProps) {
  const secondary = [
    { key: "pending", label: getStatusLabel("pending"), money: totals.pending },
    { key: "approved", label: getStatusLabel("approved"), money: totals.approved },
    { key: "paid", label: getStatusLabel("paid"), money: totals.paid },
  ] as const;

  return (
    <section
      aria-labelledby="cashback-payable-heading"
      className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-5 shadow-[var(--shadow-sm)]"
    >
      <h2
        id="cashback-payable-heading"
        className="text-sm font-medium text-[color:var(--text-muted)]"
      >
        {getStatusLabel("payable")}
      </h2>

      <p className="mt-1 text-3xl font-semibold tracking-[-0.02em] tabular-nums text-[color:var(--text)] md:text-4xl">
        {formatMoney(totals.payable)}
      </p>

      <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
        Đây là tổng cashback đang ở trạng thái có thể rút. Tính năng yêu cầu
        thanh toán chưa khả dụng.
      </p>

      <dl className="mt-4 grid gap-2 border-t border-[color:var(--line)] pt-3 text-sm">
        {secondary.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-4">
            <dt className="font-medium text-[color:var(--text-muted)]">
              {item.label}
            </dt>
            <dd className="min-w-0 font-medium tabular-nums text-[color:var(--text)]">
              {formatMoney(item.money)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
