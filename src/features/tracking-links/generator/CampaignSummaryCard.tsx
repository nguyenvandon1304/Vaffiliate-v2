import type { Campaign } from "@/types/affiliate";

type Props = {
  campaign: Campaign;
  advertiserName: string;
};

function formatDateRange(startDate: string, endDate?: string): string {
  if (!endDate) return `Từ ${startDate}`;
  return `${startDate} → ${endDate}`;
}

const statusLabels: Record<Campaign["status"], string> = {
  draft: "Bản nháp",
  active: "Đang chạy",
  paused: "Tạm dừng",
  ended: "Đã kết thúc",
};

export default function CampaignSummaryCard({ campaign, advertiserName }: Props) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">Chiến dịch</p>
      <h2 className="mt-2 text-lg font-semibold tracking-tight text-[color:var(--text)]">
        {campaign.name}
      </h2>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[color:var(--text-muted)]">Đối tác</dt>
          <dd className="font-medium text-[color:var(--text)]">{advertiserName}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[color:var(--text-muted)]">Trạng thái</dt>
          <dd className="font-medium text-[color:var(--text)]">{statusLabels[campaign.status]}</dd>
        </div>
        <div className="flex items-center justify-between gap-4">
          <dt className="text-[color:var(--text-muted)]">Thời gian</dt>
          <dd className="text-right font-medium text-[color:var(--text)]">
            {formatDateRange(campaign.startDate, campaign.endDate)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
