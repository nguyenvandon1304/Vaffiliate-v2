import { financeTransactions } from "@/lib/mock-data";

export default function TransactionHistory() {
  return (
    <section className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.72)] p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[color:var(--text)]">Lịch sử giao dịch</h2>
      </div>
      <div className="grid gap-3">
        {financeTransactions.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,248,242,0.72)] p-5 shadow-[var(--shadow-sm)]">
            <p className="text-base font-semibold text-[color:var(--text)]">Chưa có giao dịch</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
              Chưa có giao dịch nào để hiển thị.
            </p>
          </div>
        ) : (
          financeTransactions.map((transaction) => (
            <article
              key={`${transaction.title}-${transaction.time}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.08)] bg-[rgba(255,248,242,0.62)] px-4 py-4 text-sm md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_auto]"
            >
              <div className="min-w-0">
                <p className="font-semibold text-[color:var(--text)] break-words">{transaction.title}</p>
                <p className="mt-1 text-sm font-medium text-[color:var(--text-muted)]">
                  {transaction.time}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 text-right">
                <p className="font-semibold text-[color:var(--brand-strong)] break-words">
                  {transaction.amount}
                </p>
                <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 text-center text-xs font-medium text-[color:var(--brand-strong)]">
                  {transaction.status}
                </span>
              </div>
              <span className="col-span-2 text-right text-xs font-medium text-[color:var(--text-muted)] md:col-span-1">
                Cập nhật gần đây
              </span>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
