import Badge from "@/components/ui/Badge";
import type { CampaignDetail } from "@/types/affiliate";

type Props = {
  campaignDetail: CampaignDetail;
};

const statusLabels: Record<CampaignDetail["campaign"]["status"], string> = {
  draft: "Bản nháp",
  active: "Đang chạy",
  paused: "Tạm dừng",
  ended: "Đã kết thúc",
};

function formatDateRange(startDate: string, endDate?: string): string {
  if (!endDate) return `Từ ${startDate}`;
  return `${startDate} → ${endDate}`;
}

export default function CampaignHeader({ campaignDetail }: Props) {
  const { campaign, advertiser } = campaignDetail;

  return (
    <div className="surface-card flex flex-col gap-4 bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[color:var(--text-muted)]">
          Chiến dịch · {advertiser.platform}
        </p>
        <h1 className="mt-2 truncate text-2xl font-semibold tracking-[-0.04em] text-[color:var(--text)] md:text-[1.75rem]">
          {campaign.name}
        </h1>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">
          {advertiser.name} · {formatDateRange(campaign.startDate, campaign.endDate)}
        </p>
      </div>
      <Badge variant={campaign.status === "active" ? "success" : "neutral"}>
        {statusLabels[campaign.status]}
      </Badge>
    </div>
  );
}
