import type { SupportedPlatformLabel } from "@/types/affiliate";

type CommissionPlatformAnalytics = {
  platform: SupportedPlatformLabel;
  totalCashback: string;
  approvedCashback: string;
  pendingCashback: string;
  share: number;
};

export default function CommissionPlatformBreakdown({
  breakdown,
}: {
  breakdown: CommissionPlatformAnalytics[];
}) {
  return (
    <section className="mb-4 grid gap-3 sm:grid-cols-2">
      {breakdown.map((item) => (
        <article
          key={item.platform}
          className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-5 shadow-[var(--shadow-sm)]"
        >
          <div className="flex items-center justify-between">
            <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 text-sm font-semibold text-[color:var(--brand-strong)]">
              {item.platform}
            </span>
            <span className="text-sm font-semibold text-[color:var(--text)]">
              {item.share.toFixed(1)}%
            </span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-medium text-[color:var(--text-muted)]">
              Tổng cashback dự kiến
            </p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--success)]">
              {item.totalCashback}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[color:var(--line)] pt-3 text-sm">
            <div>
              <p className="text-xs font-medium text-[color:var(--text-muted)]">Đã duyệt</p>
              <p className="mt-1 font-semibold text-[color:var(--text)]">
                {item.approvedCashback}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-[color:var(--text-muted)]">Chờ duyệt</p>
              <p className="mt-1 font-semibold text-[color:var(--text)]">
                {item.pendingCashback}
              </p>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
