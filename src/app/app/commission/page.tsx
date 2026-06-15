import AppShell from "@/components/layout/AppShell";
import AppSection from "@/components/layout/AppSection";
import PageHeader from "@/components/layout/PageHeader";
import CommissionCampaignTable from "@/features/commission/CommissionCampaignTable";
import CommissionPlatformBreakdown from "@/features/commission/CommissionPlatformBreakdown";
import CommissionStats from "@/features/commission/CommissionStats";
import { useAffiliateAsync } from "@/hooks/useAffiliateAsync";
import type {
  CampaignCommission,
  CommissionStat,
  PlatformCommission,
  SupportedPlatformLabel,
} from "@/types/affiliate";
import type { PlatformLabel } from "@/types/common";

const supportedPlatforms: Partial<Record<PlatformLabel, SupportedPlatformLabel>> = {
  Shopee: "Shopee",
  "TikTok Shop": "TikTok Shop",
};

function formatVnd(amount: number): string {
  return `${Math.round(amount).toLocaleString("de-DE")}đ`;
}

function parseOrderValue(orderValue: string): number {
  return Number(orderValue.replace(/[^\d]/g, ""));
}

function parseRate(commissionRate: string): number {
  return Number(commissionRate.replace(/[^\d.]/g, ""));
}

type CommissionRow = {
  platform: SupportedPlatformLabel;
  campaignName: string;
  commission: number;
};

export default async function CommissionPage() {
  const { advertisers, campaigns, offers, trackingLinks, conversions } = await useAffiliateAsync();

  const rows: CommissionRow[] = conversions.flatMap((conversion) => {
    const link = trackingLinks.find((item) => item.id === conversion.trackingLinkId);
    if (!link) return [];
    const offer = offers.find((item) => item.id === link.offerId);
    if (!offer) return [];
    if (offer.commissionModel !== "CPS") return [];
    const campaign = campaigns.find((item) => item.id === offer.campaignId);
    if (!campaign) return [];
    const advertiser = advertisers.find((item) => item.id === campaign.advertiserId);
    if (!advertiser) return [];
    const platform = supportedPlatforms[advertiser.platform];
    if (!platform) return [];
    const order = parseOrderValue(conversion.orderValue);
    const rate = parseRate(offer.commissionRate);
    if (!Number.isFinite(order) || !Number.isFinite(rate)) return [];
    return [
      {
        platform,
        campaignName: campaign.name,
        commission: (order * rate) / 100,
      },
    ];
  });

  const totalCommission = rows.reduce((sum, row) => sum + row.commission, 0);

  const platformTotals = new Map<SupportedPlatformLabel, { conversions: number; commission: number }>();
  const campaignTotals = new Map<
    string,
    { campaignName: string; platform: SupportedPlatformLabel; conversions: number; commission: number }
  >();

  for (const row of rows) {
    const p = platformTotals.get(row.platform) ?? { conversions: 0, commission: 0 };
    p.conversions += 1;
    p.commission += row.commission;
    platformTotals.set(row.platform, p);

    const key = `${row.campaignName}__${row.platform}`;
    const c =
      campaignTotals.get(key) ?? {
        campaignName: row.campaignName,
        platform: row.platform,
        conversions: 0,
        commission: 0,
      };
    c.conversions += 1;
    c.commission += row.commission;
    campaignTotals.set(key, c);
  }

  const shopeeTotal = platformTotals.get("Shopee")?.commission ?? 0;
  const tiktokTotal = platformTotals.get("TikTok Shop")?.commission ?? 0;

  const stats: CommissionStat[] = [
    { label: "Tổng hoa hồng", value: formatVnd(totalCommission) },
    { label: "Hoa hồng Shopee", value: formatVnd(shopeeTotal) },
    { label: "Hoa hồng TikTok", value: formatVnd(tiktokTotal) },
    { label: "Chuyển đổi CPS", value: String(rows.length) },
  ];

  const breakdown: PlatformCommission[] = (["Shopee", "TikTok Shop"] as const)
    .filter((platform) => platformTotals.has(platform))
    .map((platform) => {
      const totals = platformTotals.get(platform)!;
      return {
        platform,
        conversions: totals.conversions,
        totalCommission: formatVnd(totals.commission),
      };
    });

  const campaignCommissions: CampaignCommission[] = Array.from(campaignTotals.values()).map(
    (item) => ({
      campaignName: item.campaignName,
      platform: item.platform,
      conversions: item.conversions,
      totalCommission: formatVnd(item.commission),
    })
  );

  const desktopContent = (
    <div className="space-y-6">
      <section className="surface-card overflow-hidden bg-[linear-gradient(180deg,rgba(255,252,249,0.92),rgba(248,238,231,0.96))] p-6">
        <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
          Phân tích hoa hồng từ Shopee và TikTok Shop
        </p>
        <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-[color:var(--text)]">
          Commission Dashboard
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[color:var(--text-muted)]">
          Tổng hợp hoa hồng dự kiến từ các chuyển đổi CPS của offer Shopee và TikTok Shop.
        </p>
      </section>

      <CommissionStats stats={stats} />
      <CommissionPlatformBreakdown breakdown={breakdown} />
      <CommissionCampaignTable campaigns={campaignCommissions} />
    </div>
  );

  return (
    <AppShell desktopContent={desktopContent}>
      <AppSection>
        <PageHeader
          eyebrow={
            <p className="mb-2 text-sm font-medium text-[color:var(--text-muted)]">
              Phân tích hoa hồng từ Shopee và TikTok Shop
            </p>
          }
          title="Commission Dashboard"
          description="Tổng hợp hoa hồng dự kiến từ các chuyển đổi CPS của offer Shopee và TikTok Shop."
        />
      </AppSection>
      <AppSection>
        <CommissionStats stats={stats} />
      </AppSection>
      <AppSection>
        <CommissionPlatformBreakdown breakdown={breakdown} />
      </AppSection>
      <CommissionCampaignTable campaigns={campaignCommissions} />
    </AppShell>
  );
}
