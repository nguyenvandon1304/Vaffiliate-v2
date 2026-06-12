import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import FinanceSummary from "@/features/finance/FinanceSummary";
import TransactionHistory from "@/features/finance/TransactionHistory";
import WithdrawCard from "@/features/finance/WithdrawCard";

export default function FinancePage() {
  const desktopContent = (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
          <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
            Quản lý số dư hoàn tiền của bạn
          </p>
          <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
            Tài chính
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--text-muted)]">
            Số dư khả dụng chỉ được cộng sau khi đơn được đối soát và hoa hồng được sàn duyệt.
          </p>
        </div>

        <WithdrawCard />
      </section>

      <FinanceSummary />
      <TransactionHistory />
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Quản lý số dư hoàn tiền của bạn
            </p>
          }
          title="Tài chính"
          description="Số dư khả dụng chỉ được cộng sau khi đơn được đối soát và hoa hồng được sàn duyệt."
        />
      </AppSection>
      <AppSection>
        <WithdrawCard />
      </AppSection>
      <AppSection>
        <FinanceSummary />
      </AppSection>
      <AppSection>
        <TransactionHistory />
      </AppSection>
    </AppShell>
  );
}
