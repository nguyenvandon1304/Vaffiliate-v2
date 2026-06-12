import { financeTransactions } from "@/lib/mock-data";

export default function TransactionHistory() {
  return (
    <section className="pb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-[color:var(--text)]">
          Lịch sử giao dịch
        </h2>
      </div>
      <div className="grid gap-3">
        {financeTransactions.map((transaction) => (
          <article
            key={`${transaction.title}-${transaction.time}`}
            className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[color:var(--text)]">{transaction.title}</p>
                <p className="mt-1 text-sm font-medium text-[color:var(--text-muted)]">
                  {transaction.time}
                </p>
              </div>
              <p className="text-sm font-semibold text-[color:var(--brand-strong)]">
                {transaction.amount}
              </p>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-sm">
              <span className="font-medium text-[color:var(--text-muted)]">Trạng thái</span>
              <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 font-medium text-[color:var(--brand-strong)]">
                {transaction.status}
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
