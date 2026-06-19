import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/layout/PageHeader";
import FinanceSummary from "@/features/finance/FinanceSummary";
import TransactionHistory from "@/features/finance/TransactionHistory";
import WithdrawCard from "@/features/finance/WithdrawCard";
import { loadFinanceAsync } from "@/hooks/loadFinanceAsync";

export default async function FinancePage() {
  let data;
  try {
    data = await loadFinanceAsync();
  } catch {
    data = null;
  }

  const summary = data?.summary ?? [
    { label: "Có thể rút", value: "0đ" },
    { label: "Đang chờ duyệt", value: "0đ" },
    { label: "Đã nhận", value: "0đ" },
  ];
  const transactions = data?.transactions ?? [];

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
          Cashback chỉ khả dụng để rút sau khi đối tác xác nhận giao dịch và chuyển sang trạng thái có thể rút.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <FinanceSummary summary={summary} />
        <WithdrawCard />
      </div>

      <TransactionHistory transactions={transactions} />

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

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Quản lý số dư cashback của bạn
            </p>
          }
          title="Ví tiền"
          description="Cashback chỉ khả dụng để rút sau khi đối tác xác nhận giao dịch và chuyển sang trạng thái có thể rút."
        />
      </AppSection>
      <AppSection>
        <WithdrawCard />
      </AppSection>
      <AppSection>
        <FinanceSummary summary={summary} />
      </AppSection>
      <AppSection>
        <TransactionHistory transactions={transactions} />
      </AppSection>
      <AppSection className="pb-8">
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
      </AppSection>
    </AppShell>
  );
}
