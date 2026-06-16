type TrendRow = {
  date: string;
  revenue: string;
  conversionCount: number;
};

export default function RevenueTrendTable({ trend }: { trend: TrendRow[] }) {
  return (
    <section className="mb-4">
      <div className="grid gap-3">
        {trend.map((row) => (
          <article
            key={row.date}
            className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold text-[color:var(--text)]">{row.date}</p>
              <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-strong)]">
                {row.conversionCount} chuyển đổi
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-sm">
              <span className="font-medium text-[color:var(--text-muted)]">Doanh thu</span>
              <span className="font-semibold text-[color:var(--text)]">{row.revenue}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
