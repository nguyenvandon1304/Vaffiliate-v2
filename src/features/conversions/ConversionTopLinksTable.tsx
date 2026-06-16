import Badge from "@/components/ui/Badge";
import type { SupportedPlatformLabel } from "@/types/affiliate";

type TopLinkRow = {
  trackingCode: string;
  platform: SupportedPlatformLabel;
  conversions: number;
};

export default function ConversionTopLinksTable({ links }: { links: TopLinkRow[] }) {
  return (
    <section className="pb-8">
      <div className="grid gap-3">
        {links.map((link) => (
          <article
            key={link.trackingCode}
            className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Badge variant="neutral">{link.trackingCode}</Badge>
                <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-strong)]">
                  {link.platform}
                </span>
              </div>
              <span className="font-semibold text-[color:var(--text)]">
                {link.conversions} chuyển đổi
              </span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
