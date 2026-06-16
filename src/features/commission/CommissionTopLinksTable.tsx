import Badge from "@/components/ui/Badge";
import type { SupportedPlatformLabel } from "@/types/affiliate";

type TopLinkRow = {
  trackingCode: string;
  platform: SupportedPlatformLabel;
  commission: string;
  conversions: number;
};

export default function CommissionTopLinksTable({ links }: { links: TopLinkRow[] }) {
  return (
    <section className="mb-4">
      <div className="grid gap-3">
        {links.map((link) => (
          <article
            key={link.trackingCode}
            className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge variant="neutral">{link.trackingCode}</Badge>
                <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-strong)]">
                  {link.platform}
                </span>
              </div>
              <span className="text-sm font-medium text-[color:var(--text-muted)]">
                {link.conversions} chuyển đổi
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[color:var(--line)] pt-3 text-sm">
              <span className="font-medium text-[color:var(--text-muted)]">Hoa hồng</span>
              <span className="font-semibold text-[color:var(--success)]">{link.commission}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
