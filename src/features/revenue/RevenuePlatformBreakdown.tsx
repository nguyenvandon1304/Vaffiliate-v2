import Badge from "@/components/ui/Badge";
import type { RevenuePlatform } from "@/types/affiliate";

export default function RevenuePlatformBreakdown({
  platforms,
}: {
  platforms: RevenuePlatform[];
}) {
  return (
    <section className="mb-4 grid gap-3 sm:grid-cols-2">
      {platforms.map((item) => (
        <article
          key={item.platform}
          className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-5 shadow-[var(--shadow-sm)]"
        >
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 text-sm font-semibold text-[color:var(--brand-strong)]">
              {item.platform}
            </span>
            <Badge variant="neutral">{item.conversions} chuyển đổi</Badge>
          </div>
          <div className="mt-4 grid gap-3">
            <div>
              <p className="text-xs font-medium text-[color:var(--text-muted)]">
                Doanh thu đơn hàng
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--text)]">
                {item.revenue}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[color:var(--text-muted)]">
                Hoa hồng dự kiến
              </p>
              <p className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--success)]">
                {item.commission}
              </p>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
