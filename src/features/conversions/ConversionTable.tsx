import Badge from "@/components/ui/Badge";
import type { ConversionView } from "@/types/affiliate";

type BadgeVariant = "default" | "success" | "warning" | "neutral";

const statusLabels: Record<ConversionView["status"], string> = {
  pending: "Chờ đối soát",
  approved: "Đã duyệt",
  rejected: "Từ chối",
  paid: "Đã thanh toán",
};

const statusVariants: Record<ConversionView["status"], BadgeVariant> = {
  pending: "warning",
  approved: "success",
  rejected: "neutral",
  paid: "default",
};

export default function ConversionTable({ conversions }: { conversions: ConversionView[] }) {
  return (
    <section className="pb-8">
      <div className="grid gap-3">
        {conversions.map((conversion) => (
          <article
            key={conversion.id}
            className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[color:var(--text)]">{conversion.offerTitle}</p>
                <p className="mt-1 text-sm font-medium text-[color:var(--text-muted)]">
                  {conversion.campaignName}
                </p>
              </div>
              <Badge variant={statusVariants[conversion.status]}>
                {statusLabels[conversion.status]}
              </Badge>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 font-medium text-[color:var(--brand-strong)]">
                {conversion.platform}
              </span>
              <span className="font-medium text-[color:var(--text-muted)]">
                {conversion.advertiserName}
              </span>
            </div>
            <div className="mt-3 grid gap-2 border-t border-[color:var(--line)] pt-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[color:var(--text-muted)]">Giá trị đơn</span>
                <span className="font-medium text-[color:var(--text)]">{conversion.orderValue}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-[color:var(--text-muted)]">Hoa hồng</span>
                <span className="font-semibold text-[color:var(--success)]">
                  {conversion.commissionValue}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-[color:var(--text-muted)]">Mã tracking</span>
                <Badge variant="neutral">{conversion.trackingCode}</Badge>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
