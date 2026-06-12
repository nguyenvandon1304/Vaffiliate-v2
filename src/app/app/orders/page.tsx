import ResponsiveAppShell from "@/components/app/ResponsiveAppShell";
import { orderFilters, recentOrders } from "@/lib/mock-data";

export default function OrdersPage() {
  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Theo dõi tiến trình đơn affiliate
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Đơn hàng
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          Tiền hoàn không có ngay lập tức. Đơn cần được ghi nhận, đối soát và duyệt hoa hồng trước khi có thể rút.
        </p>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.72)] p-5 shadow-[var(--shadow-sm)]">
        <div className="mb-4 flex flex-wrap gap-2">
          {orderFilters.map((filter, index) => (
            <button
              key={filter}
              type="button"
              className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${
                index === 0
                  ? "bg-[rgba(216,138,82,0.14)] text-[color:var(--brand-strong)]"
                  : "border border-[rgba(124,63,44,0.12)] text-[color:var(--text-muted)]"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] shadow-[var(--shadow-sm)]">
          <div className="grid grid-cols-[1fr_1.4fr_1fr_1fr_1fr_0.9fr] gap-4 border-b border-[color:var(--line)] bg-[rgba(255,248,242,0.92)] px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
            <span>Sàn</span>
            <span>Sản phẩm</span>
            <span>Trạng thái</span>
            <span>Hoàn tiền</span>
            <span>Giá trị đơn</span>
            <span>Ngày</span>
          </div>

          <div className="divide-y divide-[color:var(--line)]">
            {recentOrders.map((order) => (
              <article
                key={`${order.store}-${order.time}`}
                className="grid grid-cols-[1fr_1.4fr_1fr_1fr_1fr_0.9fr] gap-4 px-5 py-4 text-sm"
              >
                <span className="font-semibold text-[color:var(--text)]">{order.store}</span>
                <span className="font-medium text-[color:var(--text)]">{order.item}</span>
                <span>
                  <span className="inline-flex rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 text-xs font-medium text-[color:var(--brand-strong)]">
                    {order.status}
                  </span>
                </span>
                <span className="font-semibold text-[color:var(--success)]">{order.amount}</span>
                <span className="font-medium text-[color:var(--text)]">{order.total}</span>
                <span className="font-medium text-[color:var(--text-muted)]">{order.time}</span>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <ResponsiveAppShell desktopContent={desktopContent}>

          <section className="mb-4">
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Theo dõi tiến trình đơn affiliate
            </p>
            <div className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.9),rgba(248,238,231,0.92))] p-5">
              <h1 className="text-[1.75rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
                Đơn hàng
              </h1>
              <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
                Tiền hoàn không có ngay lập tức. Đơn cần được ghi nhận, đối soát và duyệt hoa hồng trước khi có thể rút.
              </p>
            </div>
          </section>

          <section className="mb-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-[color:var(--text)]">
                Bộ lọc trạng thái
              </h2>
            </div>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {orderFilters.map((filter, index) => (
                <button
                  key={filter}
                  type="button"
                  className={`whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ${
                    index === 0
                      ? "bg-[rgba(216,138,82,0.14)] text-[color:var(--brand-strong)]"
                      : "border border-[rgba(124,63,44,0.12)] text-[color:var(--text-muted)]"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </section>

          <section className="pb-8">
            <div className="grid gap-3">
              {recentOrders.map((order) => (
                <article
                  key={`${order.store}-${order.time}`}
                  className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[color:var(--text)]">
                        {order.store}
                      </p>
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
                    <span className="font-medium text-[color:var(--text-muted)]">
                      {order.time}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-sm">
                    <span className="font-medium text-[color:var(--text-muted)]">
                      Giá trị đơn
                    </span>
                    <span className="font-medium text-[color:var(--text)]">
                      {order.total}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
    </ResponsiveAppShell>
  );
}
