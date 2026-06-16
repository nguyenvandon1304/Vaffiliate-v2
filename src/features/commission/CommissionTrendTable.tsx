type TrendRow = {
  date: string;
  shopee: string;
  tiktok: string;
  total: string;
};

export default function CommissionTrendTable({ trend }: { trend: TrendRow[] }) {
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
                {row.total}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[color:var(--line)] pt-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[color:var(--text-muted)]">Shopee</span>
                <span className="font-semibold text-[color:var(--text)]">{row.shopee}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-[color:var(--text-muted)]">TikTok Shop</span>
                <span className="font-semibold text-[color:var(--text)]">{row.tiktok}</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
