import ResponsiveAppShell from "@/components/app/ResponsiveAppShell";
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

        <div className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.82)] p-5 shadow-[var(--shadow-sm)]">
          <button
            type="button"
            className="w-full rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)]"
          >
            Yêu cầu rút tiền
          </button>
          <p className="mt-3 text-xs leading-5 text-[color:var(--text-muted)]">
            Rút tối thiểu 100.000đ. Yêu cầu rút tiền sẽ được xử lý sau khi thông tin tài khoản hợp lệ.
          </p>
        </div>
      </section>

      <FinanceSummary />
      <TransactionHistory />
    </div>
  );

  return (
    <ResponsiveAppShell desktopContent={desktopContent}>
      <WithdrawCard />
      <FinanceSummary />
      <TransactionHistory />
    </ResponsiveAppShell>
  );
}
