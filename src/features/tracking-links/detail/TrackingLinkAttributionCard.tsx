import type { Advertiser, Campaign, Offer, TrackingLink, TrackingLinkStats } from "@/types/affiliate";

type Props = {
  trackingLink: TrackingLink;
  offer: Offer;
  campaign: Campaign;
  advertiser: Advertiser;
  stats: TrackingLinkStats;
};

function formatDateRange(startDate: string, endDate?: string): string {
  if (!endDate) return `Từ ${startDate}`;
  return `${startDate} → ${endDate}`;
}

export default function TrackingLinkAttributionCard({
  trackingLink,
  offer,
  campaign,
  advertiser,
  stats,
}: Props) {
  const { epc, conversionRate } = stats.metrics;
  const cr = conversionRate > 0 ? (conversionRate * 100).toFixed(2) + "%" : "—";
  const epcDisplay = epc > 0 ? Math.round(epc).toLocaleString("vi-VN") + "đ" : "—";

  const parameterRows: { label: string; value: string }[] = [
    { label: "Chương trình", value: offer.title },
    { label: "Danh mục", value: offer.category ?? "—" },
    { label: "Đối tác", value: advertiser.name },
    { label: "Nền tảng", value: advertiser.platform },
    { label: "Chiến dịch", value: campaign.name },
    { label: "Thời gian", value: formatDateRange(campaign.startDate, campaign.endDate) },
  ];

  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">Thông tin ghi nhận</p>
      <dl className="mt-3 space-y-3 text-sm">
        {parameterRows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-4">
            <dt className="text-[color:var(--text-muted)]">{row.label}</dt>
            <dd className="text-right font-medium text-[color:var(--text)]">{row.value}</dd>
          </div>
        ))}
        <div className="flex items-start justify-between gap-4 border-t border-[rgba(124,63,44,0.08)] pt-3">
          <dt className="text-[color:var(--text-muted)]">Tỷ lệ chuyển đổi</dt>
          <dd className="font-medium text-[color:var(--text)]">{cr}</dd>
        </div>
        <div className="flex items-start justify-between gap-4">
          <dt className="text-[color:var(--text-muted)]">Giá trị mỗi lượt nhấp (ước tính)</dt>
          <dd className="font-medium text-[color:var(--text)]">{epcDisplay}</dd>
        </div>
        <div className="flex items-start justify-between gap-4">
          <dt className="text-[color:var(--text-muted)]">Mã link</dt>
          <dd className="font-mono font-medium text-[color:var(--text)]">{trackingLink.shortCode}</dd>
        </div>
      </dl>
    </div>
  );
}
