import Badge from "@/components/ui/Badge";
import type { SupportedPlatformLabel } from "@/types/affiliate";

type PlatformBreakdown = {
  platform: SupportedPlatformLabel;
  conversions: number;
  approved: number;
  clicks: number;
  conversionRate: string;
};

export default function ConversionPlatformBreakdown({
  platforms,
}: {
  platforms: PlatformBreakdown[];
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
            <Badge variant="neutral">{item.clicks} lượt nhấp</Badge>
          </div>
          <div className="mt-4 grid gap-3">
            <div>
              <p className="text-xs font-medium text-[color:var(--text-muted)]">Chuyển đổi</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-[color:var(--text)]">
                {item.conversions}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-[color:var(--line)] pt-3">
              <div>
                <p className="text-xs font-medium text-[color:var(--text-muted)]">Đã duyệt</p>
                <p className="mt-1 text-base font-semibold text-[color:var(--success)]">
                  {item.approved}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-[color:var(--text-muted)]">
                  Tỷ lệ chuyển đổi
                </p>
                <p className="mt-1 text-base font-semibold text-[color:var(--text)]">
                  {item.conversionRate}
                </p>
              </div>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
