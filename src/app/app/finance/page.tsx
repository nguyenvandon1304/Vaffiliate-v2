import BuyerResponsiveShell from "@/components/buyer/BuyerResponsiveShell";
import AppSection from "@/components/layout/AppSection";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/layout/PageHeader";
import CashbackSummaryPanel from "@/features/finance/CashbackSummaryPanel";
import WithdrawCard from "@/features/finance/WithdrawCard";
import BuyerOrdersList from "@/features/orders/BuyerOrdersList";
import { GenericErrorState } from "@/features/orders/OrdersStates";
import { loadBuyerFinanceAsync } from "@/hooks/loadBuyerFinanceAsync";
import { privateRouteMetadata } from "@/lib/seo/private-route-metadata";
import type { BuyerFinanceView } from "@/lib/finance/buyer-finance-view";

export const metadata = privateRouteMetadata();

const PAGE_DESCRIPTION =
  "Cashback được xác nhận sau khi đối tác đối soát giao dịch. Số liệu bên dưới được nhóm theo trạng thái thực tế của từng đơn.";

/**
 * Phase 20M-R -- authenticated, read-only cashback overview.
 *
 * The route previously read from the mock `apiClient` backend and fell back
 * to a hardcoded `0đ` summary, which showed a fabricated zero to buyers who
 * actually had cashback. It now reads the buyer's own conversions through
 * the Phase 20L authenticated path, where ownership is enforced server-side
 * by `auth.getUser()` plus `publisher_id = user.id`.
 *
 * An error renders as an explicit error state rather than as zeroes: on a
 * money surface, "we could not load this" and "you have nothing" must never
 * look the same.
 */
export default async function FinancePage() {
  let finance: BuyerFinanceView | null = null;
  try {
    finance = await loadBuyerFinanceAsync();
  } catch {
    finance = null;
  }

  const renderFinanceContent = () => {
    if (finance === null) {
      return <GenericErrorState />;
    }

    return (
      <div className="space-y-4">
        <CashbackSummaryPanel totals={finance.totals} />
        <WithdrawCard />

        <section aria-labelledby="cashback-history-heading">
          <h2
            id="cashback-history-heading"
            className="mb-3 text-base font-semibold text-[color:var(--text)]"
          >
            Lịch sử cashback
          </h2>

          {finance.history.length === 0 ? (
            <div className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.72)] p-8 text-center shadow-[var(--shadow-sm)]">
              <p className="text-base font-semibold text-[color:var(--text)]">
                Chưa có cashback được ghi nhận
              </p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                Cashback sẽ xuất hiện tại đây sau khi bạn mua hàng qua link
                hoàn tiền và đối tác ghi nhận giao dịch.
              </p>
            </div>
          ) : (
            <BuyerOrdersList orders={finance.history} />
          )}
        </section>

        <Card className="p-4">
          <p className="text-sm font-semibold text-[color:var(--text)]">
            Điều kiện để cashback chuyển sang có thể rút
          </p>
          <ul className="mt-2 space-y-1 text-xs leading-6 text-[color:var(--text-muted)]">
            <li>1. Đơn hàng không bị hủy hoặc hoàn trả.</li>
            <li>2. Đối tác đã đối soát giao dịch.</li>
            <li>3. Cashback đã được duyệt bởi sàn.</li>
          </ul>
        </Card>
      </div>
    );
  };

  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Quản lý số dư cashback của bạn
        </p>

        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Ví tiền
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--text-muted)]">
          {PAGE_DESCRIPTION}
        </p>
      </section>

      {renderFinanceContent()}
    </div>
  );

  return (
    <BuyerResponsiveShell title="Ví tiền" desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Quản lý số dư cashback của bạn
            </p>
          }
          title="Ví tiền"
          description={PAGE_DESCRIPTION}
        />
      </AppSection>

      <AppSection className="pb-8">{renderFinanceContent()}</AppSection>
    </BuyerResponsiveShell>
  );
}
