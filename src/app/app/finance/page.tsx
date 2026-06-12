import ResponsiveAppShell from "@/components/app/ResponsiveAppShell";
import { financeSummary, financeTransactions } from "@/lib/mock-data";

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

      <section className="grid gap-4 xl:grid-cols-3">
        {financeSummary.map((item) => (
          <article
            key={item.label}
            className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-5 shadow-[var(--shadow-sm)]"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
              {item.label}
            </p>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-[color:var(--text)]">
              {item.value}
            </p>
          </article>
        ))}
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[color:var(--text)]">
            Lịch sử giao dịch
          </h2>
        </div>
        <div className="grid gap-3">
          {financeTransactions.map((transaction) => (
            <article
              key={`${transaction.title}-${transaction.time}`}
              className="grid grid-cols-[1.6fr_0.9fr_1fr_0.9fr] items-center gap-4 rounded-[var(--radius-lg)] border border-[rgba(124,63,44,0.08)] bg-[rgba(255,248,242,0.62)] px-4 py-4 text-sm"
            >
              <div>
                <p className="font-semibold text-[color:var(--text)]">
                  {transaction.title}
                </p>
                <p className="mt-1 text-sm font-medium text-[color:var(--text-muted)]">
                  {transaction.time}
                </p>
              </div>
              <p className="font-semibold text-[color:var(--brand-strong)]">
                {transaction.amount}
              </p>
              <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 text-center text-xs font-medium text-[color:var(--brand-strong)]">
                {transaction.status}
              </span>
              <span className="text-right text-xs font-medium text-[color:var(--text-muted)]">
                Cập nhật gần đây
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );

  return (
    <ResponsiveAppShell desktopContent={desktopContent}>

          <section className="mb-4">
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Quản lý số dư hoàn tiền của bạn
            </p>
            <div className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.9),rgba(248,238,231,0.92))] p-5">
              <h1 className="text-[1.75rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
                Tài chính
              </h1>
              <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                Số dư khả dụng chỉ được cộng sau khi đơn được đối soát và hoa hồng được sàn duyệt.
              </p>
              <button
                type="button"
                className="mt-4 w-full rounded-[var(--radius-lg)] bg-[color:var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)]"
              >
                Yêu cầu rút tiền
              </button>
              <p className="mt-3 text-xs leading-5 text-[color:var(--text-muted)]">
                Rút tối thiểu 100.000đ. Yêu cầu rút tiền sẽ được xử lý sau khi thông tin tài khoản hợp lệ.
              </p>
            </div>
          </section>

          <section className="mb-4 grid grid-cols-3 gap-3">
            {financeSummary.map((item) => (
              <article
                key={item.label}
                className="rounded-[var(--radius-lg)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.82)] p-3 shadow-[var(--shadow-sm)]"
              >
                <p className="text-xs font-medium text-[color:var(--text-muted)]">
                  {item.label}
                </p>
                <p className="mt-2 text-base font-semibold tracking-tight text-[color:var(--text)]">
                  {item.value}
                </p>
              </article>
            ))}
          </section>

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
                      <p className="font-semibold text-[color:var(--text)]">
                        {transaction.title}
                      </p>
                      <p className="mt-1 text-sm font-medium text-[color:var(--text-muted)]">
                        {transaction.time}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-[color:var(--brand-strong)]">
                      {transaction.amount}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-sm">
                    <span className="font-medium text-[color:var(--text-muted)]">
                      Trạng thái
                    </span>
                    <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 font-medium text-[color:var(--brand-strong)]">
                      {transaction.status}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
    </ResponsiveAppShell>
  );
}
