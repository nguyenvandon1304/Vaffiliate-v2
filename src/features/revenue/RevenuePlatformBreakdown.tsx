import Badge from "@/components/ui/Badge";
import { formatMoney } from "@/lib/analytics/format";
import type { RevenuePlatform } from "@/types/affiliate";

type RevenuePlatformAnalytics = RevenuePlatform & {
  share: number;
};

export default function RevenuePlatformBreakdown({
  platforms,
}: {
  platforms: RevenuePlatformAnalytics[];
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
                GMV
              </p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--text)]">
                {formatMoney(item.gmv)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[color:var(--text-muted)]">
                Cashback dự kiến
              </p>
              <p className="mt-1 text-xl font-semibold tracking-tight text-[color:var(--success)]">
                {formatMoney(item.publisherCashback)}
              </p>
            </div>
            <div className="border-t border-[color:var(--line)] pt-3">
              <p className="text-xs font-medium text-[color:var(--text-muted)]">
                Tỷ trọng GMV
              </p>
              <p className="mt-1 text-base font-semibold text-[color:var(--text)]">
                {item.share.toFixed(1)}%
              </p>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
