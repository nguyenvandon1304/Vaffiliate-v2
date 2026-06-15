import type { RevenueCampaign } from "@/types/affiliate";

export default function RevenueCampaignTable({
  campaigns,
}: {
  campaigns: RevenueCampaign[];
}) {
  return (
    <section className="mb-4">
      <div className="grid gap-3">
        {campaigns.map((campaign) => (
          <article
            key={`${campaign.campaignName}-${campaign.platform}`}
            className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.86)] p-4 shadow-[var(--shadow-sm)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-[color:var(--text)]">{campaign.campaignName}</p>
                <p className="mt-1 text-sm font-medium text-[color:var(--text-muted)]">
                  {campaign.conversionCount} chuyển đổi
                </p>
              </div>
              <span className="rounded-full bg-[rgba(216,138,82,0.12)] px-3 py-1 text-xs font-semibold text-[color:var(--brand-strong)]">
                {campaign.platform}
              </span>
            </div>
            <div className="mt-3 grid gap-2 border-t border-[color:var(--line)] pt-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-[color:var(--text-muted)]">Doanh thu</span>
                <span className="font-medium text-[color:var(--text)]">{campaign.revenue}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-[color:var(--text-muted)]">Hoa hồng</span>
                <span className="font-semibold text-[color:var(--success)]">
                  {campaign.commission}
                </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
